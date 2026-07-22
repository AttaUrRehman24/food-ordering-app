import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { CartService } from './application/cart.service';
import { cartEntities } from './infrastructure/persistence/entities';
import {
  buildCartDataSourceOptions,
  runCartTypeOrmMigrations,
} from './infrastructure/persistence/typeorm.data-source';
import { TypeOrmCartSnapshotRepository } from './infrastructure/persistence/typeorm.repositories';
import { RedisCartStore } from './infrastructure/redis/redis-cart.store';
import { GrpcCatalogPriceLookup } from './infrastructure/catalog/grpc-catalog-price.lookup';
import { CartGrpcController } from './interface/grpc/cart.grpc.controller';
import { HealthController } from './health/health.controller';
import { createStructuredLog, HEALTH_CHECKS, logJson } from '@food-ordering/observability';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => buildCartDataSourceOptions(),
    }),
    TypeOrmModule.forFeature(cartEntities),
  ],
  controllers: [HealthController, CartGrpcController],
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
      provide: CartService,
      useFactory: (dataSource: DataSource, redis: Redis) =>
        new CartService({
          store: new RedisCartStore(redis),
          snapshot: new TypeOrmCartSnapshotRepository(dataSource.manager),
          catalog: new GrpcCatalogPriceLookup(
            process.env.CATALOG_GRPC_URL ?? 'localhost:50052',
          ),
        }),
      inject: [DataSource, 'REDIS'],
    },
  ],
})
export class AppModule {}

export async function bootstrapCartInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const dataSource = moduleRef.get(DataSource);
  await runCartTypeOrmMigrations(dataSource);
  logJson(createStructuredLog('cart', 'info', 'TypeORM migrations applied'));

  const redis = moduleRef.get<Redis>('REDIS');
  if (redis.status === 'wait') {
    await redis.connect();
  }
  logJson(createStructuredLog('cart', 'info', 'redis connected'));
}

export async function shutdownCartInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const redis = moduleRef.get<Redis>('REDIS');
  redis.disconnect();
  const dataSource = moduleRef.get(DataSource);
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
