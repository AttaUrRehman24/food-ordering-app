import { Role } from '@food-ordering/domain';
import type { KafkaMessageEnvelope } from '@food-ordering/kafka';
import type {
  AuditAction,
  AuthTokens,
  DeviceContext,
  RefreshTokenRecord,
  SessionRecord,
  UserRecord,
} from '../domain/types';

export const USER_REPO = Symbol('USER_REPO');
export const SESSION_REPO = Symbol('SESSION_REPO');
export const REFRESH_TOKEN_REPO = Symbol('REFRESH_TOKEN_REPO');
export const AUDIT_REPO = Symbol('AUDIT_REPO');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
export const OTP_STORE = Symbol('OTP_STORE');
export const RATE_LIMITER = Symbol('RATE_LIMITER');
export const TOKEN_DENYLIST = Symbol('TOKEN_DENYLIST');
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByPhone(phone: string): Promise<UserRecord | null>;
  findByEmailOrPhone(identifier: string): Promise<UserRecord | null>;
  createUser(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    role: Role;
  }): Promise<UserRecord>;
  getPasswordHash(userId: string): Promise<string | null>;
  assignRole(userId: string, role: Role): Promise<Role>;
  ensureAdminSeed(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
  }): Promise<{ user: UserRecord; created: boolean }>;
}

export interface SessionRepository {
  create(input: {
    userId: string;
    deviceUa?: string;
    ip?: string;
    accessJti: string;
  }): Promise<SessionRecord>;
  findById(sessionId: string): Promise<SessionRecord | null>;
  listByUser(userId: string): Promise<SessionRecord[]>;
  touch(sessionId: string, accessJti?: string): Promise<void>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<SessionRecord[]>;
}

export interface RefreshTokenRepository {
  create(input: {
    userId: string;
    sessionId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(tokenId: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeBySession(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface AuditRepository {
  append(input: {
    action: AuditAction;
    userId?: string | null;
    targetSessionId?: string | null;
    ip?: string;
    ua?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}

export interface TokenService {
  issueAccessToken(user: UserRecord): { token: string; jti: string; expiresAt: Date };
  verifyAccessToken(token: string): Promise<{
    userId: string;
    role: Role;
    jti: string;
    exp: number;
  } | null>;
  mintRefreshToken(): string;
}

export interface OtpStore {
  set(userId: string, hash: string, ttlSeconds: number): Promise<void>;
  get(userId: string): Promise<string | null>;
  del(userId: string): Promise<void>;
  incrAttempts(userId: string, ttlSeconds: number): Promise<number>;
  clearAttempts(userId: string): Promise<void>;
}

export interface RateLimiter {
  hit(scope: string, id: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export interface TokenDenylist {
  revoke(jti: string, ttlSeconds: number): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
}

export interface EventPublisher {
  publish(message: KafkaMessageEnvelope): Promise<void>;
}

export interface UnitOfWork {
  withTransaction<T>(fn: (repos: {
    users: UserRepository;
    sessions: SessionRepository;
    refreshTokens: RefreshTokenRepository;
    audit: AuditRepository;
  }) => Promise<T>): Promise<T>;
}

export type { AuthTokens, DeviceContext, UserRecord, SessionRecord };
