import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { createStructuredLog, initTelemetry, logJson, shutdownTelemetry } from '@food-ordering/observability';
import {
  AppModule,
  bootstrapRealtimeInfrastructure,
  shutdownRealtimeInfrastructure,
} from './app.module';

const SERVICE_NAME = 'realtime';
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 3007);

async function bootstrap(): Promise<void> {
  process.env.SERVICE_NAME = SERVICE_NAME;
  initTelemetry(SERVICE_NAME);

  const app = await NestFactory.create(AppModule, { logger: false });
  app.useWebSocketAdapter(new WsAdapter(app));

  await bootstrapRealtimeInfrastructure(app);
  await app.listen(HTTP_PORT);

  logJson(
    createStructuredLog(SERVICE_NAME, 'info', 'Realtime Gateway ( Documentation §3.2 / §10) listening', null, {
      http_port: HTTP_PORT,
      ws_path: '/ws',
    }),
  );

  const shutdown = async () => {
    await shutdownRealtimeInfrastructure(app);
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
