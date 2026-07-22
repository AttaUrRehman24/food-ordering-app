import {
  Controller,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { Role } from '@food-ordering/domain';
import { IdentityService } from '../../application/identity.service';
import { DomainError } from '../../domain/errors';
import type { AuthTokens, UserRecord } from '../../domain/types';

function mapUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function mapAuth(tokens: AuthTokens) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: mapUser(tokens.user),
  };
}

function toRpcException(err: unknown): RpcException {
  if (err instanceof DomainError) {
    const grpcStatus =
      err.httpStatus === 400
        ? GrpcStatus.INVALID_ARGUMENT
        : err.httpStatus === 401
          ? GrpcStatus.UNAUTHENTICATED
          : err.httpStatus === 403
            ? GrpcStatus.PERMISSION_DENIED
            : err.httpStatus === 404
              ? GrpcStatus.NOT_FOUND
              : err.httpStatus === 409
                ? GrpcStatus.ALREADY_EXISTS
                : err.httpStatus === 429
                  ? GrpcStatus.RESOURCE_EXHAUSTED
                  : GrpcStatus.INTERNAL;
    return new RpcException({ code: grpcStatus, message: err.message });
  }
  const message = err instanceof Error ? err.message : 'Internal error';
  return new RpcException({ code: GrpcStatus.INTERNAL, message });
}

/**  Documentation §3.2 Identity gRPC + §23 session APIs (Q1) */
@Controller()
export class IdentityGrpcController {
  constructor(private readonly identity: IdentityService) {}

  @GrpcMethod('IdentityService', 'Register')
  async register(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) {
    try {
      return mapAuth(await this.identity.register(data));
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'LoginPassword')
  async loginPassword(data: { identifier: string; password: string }) {
    try {
      return mapAuth(await this.identity.loginPassword(data));
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'RequestOtp')
  async requestOtp(data: { identifier: string; type: string }) {
    try {
      const type = data.type === 'phone' ? 'phone' : 'email';
      const res = await this.identity.requestOtp({ identifier: data.identifier, type });
      return { message: res.message, expiresIn: res.expiresIn };
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'VerifyOtp')
  async verifyOtp(data: { identifier: string; code: string }) {
    try {
      return mapAuth(await this.identity.verifyOtp(data));
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'Refresh')
  async refresh(data: { refreshToken: string }) {
    try {
      return mapAuth(await this.identity.refresh(data.refreshToken));
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'Logout')
  async logout(data: { accessJti?: string; refreshToken?: string }) {
    try {
      return await this.identity.logout({
        accessJti: data.accessJti,
        refreshToken: data.refreshToken,
      });
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'LogoutAll')
  async logoutAll(data: { userId: string }) {
    try {
      return await this.identity.logoutAll(data.userId);
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'IntrospectToken')
  async introspectToken(data: { accessToken: string }) {
    try {
      const res = await this.identity.introspectToken(data.accessToken);
      return {
        active: res.active,
        userId: res.userId ?? '',
        role: res.role ?? '',
        jti: res.jti ?? '',
      };
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'AssignRole')
  async assignRole(data: { userId: string; role: string }) {
    try {
      const role = data.role === 'admin' ? Role.Admin : Role.Customer;
      const res = await this.identity.assignRole(data.userId, role);
      return { userId: res.userId, role: res.role };
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'GetMe')
  async getMe(data: { userId: string }) {
    try {
      return mapUser(await this.identity.getMe(data.userId));
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'ListSessions')
  async listSessions(data: { userId: string }) {
    try {
      const sessions = await this.identity.listSessions(data.userId);
      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          device: s.device,
          ip: s.ip,
          createdAt: s.createdAt,
          lastActive: s.lastActive,
          current: s.current,
        })),
      };
    } catch (err) {
      throw toRpcException(err);
    }
  }

  @GrpcMethod('IdentityService', 'RevokeSession')
  async revokeSession(data: { userId: string; sessionId: string }) {
    try {
      return await this.identity.revokeSession(data.userId, data.sessionId);
    } catch (err) {
      throw toRpcException(err);
    }
  }
}

/** Map DomainError for any future HTTP BFF paths on this service */
export function domainToHttp(err: unknown): never {
  if (err instanceof DomainError) {
    throw new HttpException(err.message, err.httpStatus as HttpStatus);
  }
  throw err;
}
