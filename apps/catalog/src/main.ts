import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { createStructuredLog, initTelemetry, logJson, shutdownTelemetry } from '@food-ordering/observability';
import {
  AppModule,
  bootstrapCatalogInfrastructure,
  shutdownCatalogInfrastructure,
} from './app.module';

const SERVICE_NAME = 'catalog';
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 3003);
const GRPC_PORT = Number(process.env.GRPC_PORT ?? 50052);

async function bootstrap(): Promise<void> {
  process.env.SERVICE_NAME = SERVICE_NAME;
  initTelemetry(SERVICE_NAME);

  const app = await NestFactory.create(AppModule, { logger: false });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'foodordering.catalog.v1',
      protoPath: join(process.cwd(), 'libs/proto/protos/catalog.proto'),
      url: `0.0.0.0:${GRPC_PORT}`,
      loader: {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  });

  await bootstrapCatalogInfrastructure(app);
  await app.startAllMicroservices();
  await app.listen(HTTP_PORT);

  logJson(
    createStructuredLog(SERVICE_NAME, 'info', 'Catalog Service ( Documentation §3.2) listening', null, {
      http_port: HTTP_PORT,
      grpc_port: GRPC_PORT,
    }),
  );

  const shutdown = async () => {
    await shutdownCatalogInfrastructure(app);
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
