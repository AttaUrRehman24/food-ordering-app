import { Injectable, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { HealthController } from './health/health.controller';
import { JwtAccessVerifier } from './infrastructure/auth/jwt-access.verifier';
import { OrderStatusPubSub, PresenceStore } from './infrastructure/redis/presence-pubsub';
import { OrderStatusKafkaBridge } from './infrastructure/messaging/order-status.kafka-bridge';
import { OrderStatusGateway } from './interface/ws/order-status.gateway';
import { createStructuredLog, HEALTH_CHECKS, logJson } from '@food-ordering/observability';

@Injectable()
class JwtAccessVerifierProvider extends JwtAccessVerifier {}

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: JwtAccessVerifier,
      useClass: JwtAccessVerifierProvider,
    },
    {
      provide: 'REDIS',
      useFactory: () =>
        new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        }),
    },
    {
      provide: 'REDIS_SUB',
      useFactory: () =>
        new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: null,
          lazyConnect: true,
        }),
    },
    {
      provide: HEALTH_CHECKS,
      useFactory: (redis: Redis) => ({
        redis: async () => (await redis.ping()) === 'PONG',
      }),
      inject: ['REDIS'],
    },
    {
      provide: PresenceStore,
      useFactory: (redis: Redis) => new PresenceStore(redis),
      inject: ['REDIS'],
    },
    {
      provide: OrderStatusPubSub,
      useFactory: (pub: Redis, sub: Redis) => new OrderStatusPubSub(pub, sub),
      inject: ['REDIS', 'REDIS_SUB'],
    },
    {
      provide: OrderStatusKafkaBridge,
      useFactory: (pubSub: OrderStatusPubSub) =>
        new OrderStatusKafkaBridge(
          (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
          process.env.KAFKA_CLIENT_ID ?? 'food-ordering-realtime',
          pubSub,
        ),
      inject: [OrderStatusPubSub],
    },
    OrderStatusGateway,
  ],
})
export class AppModule {}

export async function bootstrapRealtimeInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const redis = moduleRef.get<Redis>('REDIS');
  const redisSub = moduleRef.get<Redis>('REDIS_SUB');
  if (redis.status === 'wait') {
    await redis.connect();
  }
  if (redisSub.status === 'wait') {
    await redisSub.connect();
  }
  logJson(createStructuredLog('realtime', 'info', 'redis connected'));

  const bridge = moduleRef.get(OrderStatusKafkaBridge);
  await bridge.start();
  logJson(createStructuredLog('realtime', 'info', 'Kafka → Redis Pub/Sub bridge started'));
}

export async function shutdownRealtimeInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const bridge = moduleRef.get(OrderStatusKafkaBridge);
  await bridge.stop();
  const redis = moduleRef.get<Redis>('REDIS');
  const redisSub = moduleRef.get<Redis>('REDIS_SUB');
  redis.disconnect();
  redisSub.disconnect();
}
