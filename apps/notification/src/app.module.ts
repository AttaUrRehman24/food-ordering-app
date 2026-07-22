import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { notificationEntities } from './infrastructure/persistence/entities';
import {
  buildNotificationDataSourceOptions,
  runNotificationTypeOrmMigrations,
} from './infrastructure/persistence/typeorm.data-source';
import { NotificationDispatcher } from './application/notification.dispatcher';
import {
  EmailProvider,
  SmsProvider,
  PushProvider,
  InAppProvider,
} from './infrastructure/providers/channel.providers';
import { NotificationKafkaWorker } from './infrastructure/messaging/kafka.worker';
import { HealthController } from './health/health.controller';
import { createStructuredLog, HEALTH_CHECKS, logJson } from '@food-ordering/observability';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => buildNotificationDataSourceOptions(),
    }),
    TypeOrmModule.forFeature(notificationEntities),
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: HEALTH_CHECKS,
      useFactory: (ds: DataSource) => ({
        postgres: async () => {
          await ds.query('SELECT 1');
          return true;
        },
      }),
      inject: [DataSource],
    },
    {
      provide: NotificationKafkaWorker,
      useFactory: (dataSource: DataSource) => {
        const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
        const clientId = process.env.KAFKA_CLIENT_ID ?? 'food-ordering-notification';
        const workerRef: { current: NotificationKafkaWorker | null } = { current: null };
        const dispatcher = new NotificationDispatcher(
          dataSource,
          [new EmailProvider(), new SmsProvider(), new PushProvider(), new InAppProvider()],
          async (job, error) => {
            await workerRef.current?.publishDlq(job, error);
          },
        );
        const worker = new NotificationKafkaWorker(brokers, clientId, dispatcher);
        workerRef.current = worker;
        return worker;
      },
      inject: [DataSource],
    },
  ],
})
export class AppModule {}

export async function bootstrapNotificationInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const dataSource = moduleRef.get(DataSource);
  await runNotificationTypeOrmMigrations(dataSource);
  logJson(createStructuredLog('notification', 'info', 'TypeORM migrations applied'));

  const worker = moduleRef.get(NotificationKafkaWorker);
  await worker.start();
  logJson(createStructuredLog('notification', 'info', 'Kafka consumers started'));
}

export async function shutdownNotificationInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const worker = moduleRef.get(NotificationKafkaWorker);
  await worker.stop();
  const dataSource = moduleRef.get(DataSource);
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
