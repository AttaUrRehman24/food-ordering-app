import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { CatalogService } from './application/catalog.service';
import { catalogEntities } from './infrastructure/persistence/entities';
import {
  buildCatalogDataSourceOptions,
  runCatalogTypeOrmMigrations,
} from './infrastructure/persistence/typeorm.data-source';
import { TypeOrmProductRepository } from './infrastructure/persistence/typeorm.repositories';
import { seedCatalogProducts } from './infrastructure/persistence/seed-products';
import { RedisCatalogCache } from './infrastructure/redis/catalog.cache';
import { KafkaEventPublisher } from './infrastructure/messaging/kafka.publisher';
import { S3MediaStore } from './infrastructure/media/s3-media.store';
import { CatalogGrpcController } from './interface/grpc/catalog.grpc.controller';
import { HealthController } from './health/health.controller';
import { createStructuredLog, HEALTH_CHECKS, logJson } from '@food-ordering/observability';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => buildCatalogDataSourceOptions(),
    }),
    TypeOrmModule.forFeature(catalogEntities),
  ],
  controllers: [HealthController, CatalogGrpcController],
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
        return new KafkaEventPublisher(brokers, process.env.KAFKA_CLIENT_ID ?? 'catalog');
      },
    },
    {
      provide: CatalogService,
      useFactory: (dataSource: DataSource, redis: Redis, kafka: KafkaEventPublisher) =>
        new CatalogService({
          products: new TypeOrmProductRepository(dataSource.manager),
          cache: new RedisCatalogCache(redis),
          events: kafka,
          media: new S3MediaStore(),
        }),
      inject: [DataSource, 'REDIS', 'KAFKA_PUBLISHER'],
    },
  ],
})
export class AppModule {}

export async function bootstrapCatalogInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const dataSource = moduleRef.get(DataSource);
  await runCatalogTypeOrmMigrations(dataSource);
  logJson(createStructuredLog('catalog', 'info', 'TypeORM migrations applied'));

  const redis = moduleRef.get<Redis>('REDIS');
  if (redis.status === 'wait') {
    await redis.connect();
  }
  logJson(createStructuredLog('catalog', 'info', 'redis connected'));

  const kafka = moduleRef.get<KafkaEventPublisher>('KAFKA_PUBLISHER');
  await kafka.connect();
  logJson(createStructuredLog('catalog', 'info', 'kafka producer connected'));

  const seedOnBoot = process.env.CATALOG_SEED_ON_BOOT !== 'false';
  if (seedOnBoot) {
    await seedCatalogProducts(dataSource);
  }
}

export async function shutdownCatalogInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
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
