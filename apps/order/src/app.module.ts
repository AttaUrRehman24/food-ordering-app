import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { OrderService } from './application/order.service';
import { orderEntities } from './infrastructure/persistence/entities';
import {
  buildOrderDataSourceOptions,
  runOrderTypeOrmMigrations,
} from './infrastructure/persistence/typeorm.data-source';
import { TypeOrmOrderRepository } from './infrastructure/persistence/typeorm.repositories';
import { RedisCheckoutLock } from './infrastructure/redis/checkout.lock';
import {
  GrpcCartGateway,
  GrpcCatalogGateway,
} from './infrastructure/clients/grpc.gateways';
import { CodPaymentProvider } from './infrastructure/payment/payment.provider';
import {
  KafkaEventPublisher,
  OrderFinalizerWorker,
  OutboxRelay,
} from './infrastructure/messaging/kafka.workers';
import { OrderGrpcController } from './interface/grpc/order.grpc.controller';
import { HealthController } from './health/health.controller';
import { createStructuredLog, HEALTH_CHECKS, logJson } from '@food-ordering/observability';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => buildOrderDataSourceOptions(),
    }),
    TypeOrmModule.forFeature(orderEntities),
  ],
  controllers: [HealthController, OrderGrpcController],
  providers: [
    {
      provide: 'REDIS',
      useFactory: () =>
        new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        }),
    },
    {
      provide: HEALTH_CHECKS,
      useFactory: (ds: DataSource, redis: Redis) => ({
        postgres: async () => {
          await ds.query('SELECT 1');
          return true;
        },
        redis: async () => (await redis.ping()) === 'PONG',
      }),
      inject: [DataSource, 'REDIS'],
    },
    {
      provide: 'KAFKA_PUBLISHER',
      useFactory: () => {
        const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
        return new KafkaEventPublisher(brokers, process.env.KAFKA_CLIENT_ID ?? 'order');
      },
    },
    {
      provide: 'ORDER_REPO',
      useFactory: (ds: DataSource) => new TypeOrmOrderRepository(ds),
      inject: [DataSource],
    },
    {
      provide: OrderService,
      useFactory: (ds: DataSource, redis: Redis, kafka: KafkaEventPublisher) =>
        new OrderService({
          orders: new TypeOrmOrderRepository(ds),
          cart: new GrpcCartGateway(process.env.CART_GRPC_URL ?? 'localhost:50053'),
          catalog: new GrpcCatalogGateway(process.env.CATALOG_GRPC_URL ?? 'localhost:50052'),
          lock: new RedisCheckoutLock(redis),
          payment: new CodPaymentProvider(),
          events: kafka,
        }),
      inject: [DataSource, 'REDIS', 'KAFKA_PUBLISHER'],
    },
  ],
})
export class AppModule {}

let outboxRelay: OutboxRelay | null = null;
let finalizer: OrderFinalizerWorker | null = null;

export async function bootstrapOrderInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const dataSource = moduleRef.get(DataSource);
  await runOrderTypeOrmMigrations(dataSource);
  logJson(createStructuredLog('order', 'info', 'TypeORM migrations applied'));

  const redis = moduleRef.get<Redis>('REDIS');
  if (redis.status === 'wait') {
    await redis.connect();
  }

  const kafka = moduleRef.get<KafkaEventPublisher>('KAFKA_PUBLISHER');
  await kafka.connect();

  const orders = new TypeOrmOrderRepository(dataSource);
  outboxRelay = new OutboxRelay(orders, kafka);
  outboxRelay.start();
  logJson(createStructuredLog('order', 'info', 'outbox relay started'));

  const orderService = moduleRef.get(OrderService);
  const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
  finalizer = new OrderFinalizerWorker(
    brokers,
    process.env.KAFKA_CLIENT_ID ?? 'order',
    orderService,
  );
  await finalizer.start();
  logJson(createStructuredLog('order', 'info', 'order finalizer started'));
}

export async function shutdownOrderInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  outboxRelay?.stop();
  await finalizer?.stop();
  const kafka = moduleRef.get<KafkaEventPublisher>('KAFKA_PUBLISHER');
  await kafka.disconnect();
  const redis = moduleRef.get<Redis>('REDIS');
  redis.disconnect();
  const dataSource = moduleRef.get(DataSource);
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
