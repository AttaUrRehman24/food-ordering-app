import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import type { IncomingMessage, ServerResponse } from 'http';
import httpProxy from 'http-proxy';
import { createStructuredLog, initTelemetry, logJson, shutdownTelemetry } from '@food-ordering/observability';
import {
  AppModule,
  bootstrapGatewayInfrastructure,
  shutdownGatewayInfrastructure,
} from './app.module';
import { GatewayExceptionFilter } from './interface/rest/exception.filter';
import { SWAGGER_DESCRIPTION } from './interface/rest/swagger.constants';
import {
  ApiErrorResponseDto,
  AuthTokensResponseDto,
  CartResponseDto,
  MessageResponseDto,
  OrderListResponseDto,
  OtpRequestResponseDto,
  PlaceOrderResponseDto,
  ProductListResponseDto,
  ProductResponseDto,
  UserProfileDto,
} from './interface/rest/swagger.models';
import * as express from 'express';

const SERVICE_NAME = 'gateway';
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 3001);
const REALTIME_WS_TARGET = process.env.REALTIME_WS_URL ?? 'http://localhost:3007';

async function bootstrap(): Promise<void> {
  process.env.SERVICE_NAME = SERVICE_NAME;
  initTelemetry(SERVICE_NAME);

  const app = await NestFactory.create(AppModule, { logger: false });
  //  Documentation §11 — request-size limits at the edge
  app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT ?? '64kb' }));
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    credentials: true,
  });
  app.setGlobalPrefix('v1', {
    exclude: ['health/live', 'health/ready', 'metrics'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GatewayExceptionFilter());

  const swaggerCssCandidates = [
    join(__dirname, 'interface/rest/swagger-ui.css'),
    join(process.cwd(), 'apps/gateway/src/interface/rest/swagger-ui.css'),
    join(process.cwd(), 'src/interface/rest/swagger-ui.css'),
  ];
  let swaggerCss = '';
  for (const candidate of swaggerCssCandidates) {
    try {
      swaggerCss = readFileSync(candidate, 'utf8');
      break;
    } catch {
      /* try next */
    }
  }

  const swagger = new DocumentBuilder()
    .setTitle('Food Order App API')
    .setDescription(SWAGGER_DESCRIPTION)
    .setVersion('1.0.0')
    .setContact('Food Order App Engineering', 'http://localhost:3000', 'admin@foodordering.local')
    .setLicense('UNLICENSED', 'https://localhost')
    .addServer('http://localhost:3001', 'Local development gateway')
    .addServer('http://127.0.0.1:3001', 'Local loopback')
    .setExternalDoc('Documentation hub (SETUP · API · LOAD-TESTING)', 'http://localhost:3000')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Paste accessToken from POST /v1/auth/login (or register / OTP verify). Example: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
      'access-token',
    )
    .addCookieAuth('refresh_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refresh_token',
      description: 'HttpOnly refresh cookie set by auth endpoints (browser clients)',
    })
    .addTag('auth', 'Registration, password login, email OTP, token refresh, logout')
    .addTag('catalog', 'Public product catalog — PKR prices, food images')
    .addTag('cart', 'Customer cart (Bearer + customer role only)')
    .addTag('orders', 'Customer checkout — Idempotency-Key required on place')
    .addTag('users', 'Profile and multi-device session management')
    .addTag('admin', 'Admin catalog writes + cross-customer order list')
    .build();

  const document = SwaggerModule.createDocument(app, swagger, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    extraModels: [
      ApiErrorResponseDto,
      AuthTokensResponseDto,
      OtpRequestResponseDto,
      UserProfileDto,
      ProductResponseDto,
      ProductListResponseDto,
      CartResponseDto,
      PlaceOrderResponseDto,
      OrderListResponseDto,
      MessageResponseDto,
    ],
  });

  // Enrich info for clients generating SDKs
  document.info['x-logo'] = { url: 'http://localhost:3000', altText: 'Food Order App' };
  document.externalDocs = {
    description: 'Docs: SETUP.md · API.md · LOAD-TESTING.md · HIGH-CONCURRENCY.md',
    url: 'http://localhost:3000',
  };

  SwaggerModule.setup('api/docs', app, document, {
    customCss: swaggerCss,
    customSiteTitle: ' Documentation — OpenAPI 3',
    customfavIcon: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f354.png',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 3,
      syntaxHighlight: { activate: true, theme: 'monokai' },
    },
  });

  await bootstrapGatewayInfrastructure(app);
  await app.listen(HTTP_PORT);

  //  Documentation §3.2 — WS upgrade proxy to Realtime Gateway
  const server = app.getHttpServer();
  const proxy = httpProxy.createProxyServer({
    target: REALTIME_WS_TARGET,
    ws: true,
    changeOrigin: true,
  });
  server.on('upgrade', (req: IncomingMessage, socket: import('net').Socket, head: Buffer) => {
    if (req.url?.startsWith('/ws') || req.url?.startsWith('/v1/ws')) {
      if (req.url?.startsWith('/v1/ws')) {
        req.url = req.url.replace('/v1/ws', '/ws');
      }
      proxy.ws(req, socket, head);
      return;
    }
    socket.destroy();
  });
  proxy.on('error', (err: Error, _req: IncomingMessage, res: ServerResponse | import('net').Socket) => {
    logJson(
      createStructuredLog(SERVICE_NAME, 'error', 'ws proxy error', null, {
        error: err.message,
      }),
    );
    if ('writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(502);
      res.end('Bad gateway');
    }
  });

  logJson(
    createStructuredLog(SERVICE_NAME, 'info', 'API Gateway / BFF ( Documentation §3.2 / §16) listening', null, {
      http_port: HTTP_PORT,
      swagger: '/api/docs',
      ws_proxy: REALTIME_WS_TARGET,
    }),
  );

  const shutdown = async () => {
    await shutdownGatewayInfrastructure(app);
    await shutdownTelemetry();
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
