import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@food-ordering/domain';
import { GatewayGrpcClients } from '../infrastructure/grpc/clients';

export type GatewayUser = {
  userId: string;
  role: Role;
  jti: string;
};

export const REFRESH_COOKIE = 'refresh_token';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly grpc: GatewayGrpcClients) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: GatewayUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing access token');
    }
    const accessToken = header.slice(7);
    const intro = await this.grpc.callIdentity.introspect({ accessToken });
    if (!intro.active || !intro.userId) {
      throw new UnauthorizedException('Invalid or revoked token');
    }
    req.user = {
      userId: intro.userId,
      role: intro.role as Role,
      jti: intro.jti,
    };
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: GatewayUser }>();
    if (!req.user || req.user.role !== Role.Admin) {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}

@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: GatewayUser }>();
    if (!req.user) {
      throw new UnauthorizedException();
    }
    if (req.user.role !== Role.Customer) {
      throw new ForbiddenException('Customer role required');
    }
    return true;
  }
}

export function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    return xf.split(',')[0].trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
