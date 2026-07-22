import { join } from 'path';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { IdentityService } from './application/identity.service';
import { BcryptPasswordHasher } from './infrastructure/crypto/bcrypt-password.hasher';
import { JwtTokenService } from './infrastructure/crypto/jwt-token.service';
import { KafkaEventPublisher } from './infrastructure/messaging/kafka.publisher';
import { identityEntities } from './infrastructure/persistence/entities';
import {
  TypeOrmAuditRepository,
  TypeOrmRefreshTokenRepository,
  TypeOrmSessionRepository,
  TypeOrmUnitOfWork,
  TypeOrmUserRepository,
} from './infrastructure/persistence/typeorm.repositories';
import {
  buildIdentityDataSourceOptions,
  runIdentityTypeOrmMigrations,
} from './infrastructure/persistence/typeorm.data-source';
import {
  RedisOtpStore,
  RedisRateLimiter,
  RedisTokenDenylist,
} from './infrastructure/redis/redis.adapters';
import { IdentityGrpcController } from './interface/grpc/identity.grpc.controller';
import { HealthController } from './health/health.controller';
import { createStructuredLog, HEALTH_CHECKS, logJson } from '@food-ordering/observability';
import { seedAdmin } from './infrastructure/persistence/seed-admin';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => buildIdentityDataSourceOptions(),
    }),
    TypeOrmModule.forFeature(identityEntities),
  ],
  controllers: [HealthController, IdentityGrpcController],
  providers: [
    {
      provide: 'REDIS',
      useFactory: () => {
        const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
        return new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
      },
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
        const clientId = process.env.KAFKA_CLIENT_ID ?? 'identity';
        return new KafkaEventPublisher(brokers, clientId);
      },
    },
    {
      provide: IdentityService,
      useFactory: (dataSource: DataSource, redis: Redis, kafka: KafkaEventPublisher) => {
        const accessTtl = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
        const refreshTtl = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2592000);
        const em = dataSource.manager;
        return new IdentityService({
          users: new TypeOrmUserRepository(em),
          sessions: new TypeOrmSessionRepository(em),
          refreshTokens: new TypeOrmRefreshTokenRepository(em),
          audit: new TypeOrmAuditRepository(em),
          passwords: new BcryptPasswordHasher(),
          tokens: new JwtTokenService(accessTtl, join(process.cwd(), 'apps/identity/keys')),
          otp: new RedisOtpStore(redis),
          rateLimiter: new RedisRateLimiter(redis),
          denylist: new RedisTokenDenylist(redis),
          events: kafka,
          uow: new TypeOrmUnitOfWork(dataSource),
          accessTtlSeconds: accessTtl,
          refreshTtlSeconds: refreshTtl,
        });
      },
      inject: [DataSource, 'REDIS', 'KAFKA_PUBLISHER'],
    },
  ],
})
export class AppModule {}

export async function bootstrapIdentityInfrastructure(moduleRef: {
  get: <T>(token: string | (abstract new (...args: never[]) => T) | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const dataSource = moduleRef.get(DataSource);

  await runIdentityTypeOrmMigrations(dataSource);
  logJson(createStructuredLog('identity', 'info', 'TypeORM migrations applied'));

  const redis = moduleRef.get<Redis>('REDIS');
  if (redis.status === 'wait') {
    await redis.connect();
  }
  logJson(createStructuredLog('identity', 'info', 'redis connected'));

  const kafka = moduleRef.get<KafkaEventPublisher>('KAFKA_PUBLISHER');
  await kafka.connect();
  logJson(createStructuredLog('identity', 'info', 'kafka producer connected'));

  await seedAdmin(dataSource);
}

export async function shutdownIdentityInfrastructure(moduleRef: {
  get: <T>(token: string | (abstract new (...args: never[]) => T) | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const kafka = moduleRef.get<KafkaEventPublisher>('KAFKA_PUBLISHER');
  await kafka.disconnect();
  const redis = moduleRef.get<Redis>('REDIS');
  redis.disconnect();
  const dataSource = moduleRef.get(DataSource);
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
