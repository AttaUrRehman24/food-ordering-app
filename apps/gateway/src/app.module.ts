import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import Redis from 'ioredis';
import { HEALTH_CHECKS } from '@food-ordering/observability';
import { HealthController } from './health/health.controller';
import { GatewayGrpcClients } from './infrastructure/grpc/clients';
import { GatewayRateLimiter } from './infrastructure/redis/rate-limiter';
import { AuthGuard, AdminGuard, CustomerGuard } from './auth/auth.guards';
import { AuthController } from './interface/rest/auth.controller';
import { CatalogController } from './interface/rest/catalog.controller';
import { CartController } from './interface/rest/cart.controller';
import { OrdersController } from './interface/rest/orders.controller';
import { UsersController } from './interface/rest/users.controller';
import { AdminController } from './interface/rest/admin.controller';
import {
  TraceMetricsMiddleware,
  securityHeadersMiddleware,
} from './middleware/trace-metrics.middleware';

@Module({
  controllers: [
    HealthController,
    AuthController,
    CatalogController,
    CartController,
    OrdersController,
    UsersController,
    AdminController,
  ],
  providers: [
    GatewayGrpcClients,
    {
      provide: 'REDIS',
      useFactory: () =>
        new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        }),
    },
    {
      provide: GatewayRateLimiter,
      useFactory: (redis: Redis) => new GatewayRateLimiter(redis),
      inject: ['REDIS'],
    },
    {
      provide: HEALTH_CHECKS,
      useFactory: (redis: Redis) => ({
        redis: async () => {
          const pong = await redis.ping();
          return pong === 'PONG';
        },
      }),
      inject: ['REDIS'],
    },
    AuthGuard,
    AdminGuard,
    CustomerGuard,
    TraceMetricsMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(securityHeadersMiddleware, TraceMetricsMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}

export async function bootstrapGatewayInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const redis = moduleRef.get<Redis>('REDIS');
  if (redis.status === 'wait') {
    await redis.connect();
  }
}

export async function shutdownGatewayInfrastructure(moduleRef: {
  get: <T>(token: string | (new (...args: never[]) => T)) => T;
}): Promise<void> {
  const redis = moduleRef.get<Redis>('REDIS');
  redis.disconnect();
}
