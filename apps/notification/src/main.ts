import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createStructuredLog, initTelemetry, logJson, shutdownTelemetry } from '@food-ordering/observability';
import {
  AppModule,
  bootstrapNotificationInfrastructure,
  shutdownNotificationInfrastructure,
} from './app.module';

const SERVICE_NAME = 'notification';
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 3006);

async function bootstrap(): Promise<void> {
  process.env.SERVICE_NAME = SERVICE_NAME;
  initTelemetry(SERVICE_NAME);

  const app = await NestFactory.create(AppModule, { logger: false });
  await bootstrapNotificationInfrastructure(app);
  await app.listen(HTTP_PORT);

  logJson(
    createStructuredLog(SERVICE_NAME, 'info', 'Notification Workers ( Documentation §3.2 / §9) listening', null, {
      http_port: HTTP_PORT,
    }),
  );

  const shutdown = async () => {
    await shutdownNotificationInfrastructure(app);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((err: unknown) => {
  logJson(
    createStructuredLog(SERVICE_NAME, 'error', 'bootstrap failed', null, {
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
