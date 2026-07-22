import { randomUUID } from 'crypto';
import { Role } from '@food-ordering/domain';
import { KafkaTopics } from '@food-ordering/kafka';
import {
  ConflictError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '../domain/errors';
import {
  assertEmail,
  assertPasswordPolicy,
  assertPhone,
  generateOtpCode,
  hashOpaqueToken,
  hashOtp,
  normalizePhone,
  verifyOtpConstantTime,
} from '../domain/security';
import type { AuthTokens, DeviceContext, SessionRecord, UserRecord } from '../domain/types';
import type {
  AuditRepository,
  EventPublisher,
  OtpStore,
  PasswordHasher,
  RateLimiter,
  RefreshTokenRepository,
  SessionRepository,
  TokenDenylist,
  TokenService,
  UnitOfWork,
  UserRepository,
} from './ports';

const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_LIMIT = 3;
const OTP_REQUEST_WINDOW_SECONDS = 600;
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 600;

export interface IdentityServiceDeps {
  users: UserRepository;
  sessions: SessionRepository;
  refreshTokens: RefreshTokenRepository;
  audit: AuditRepository;
  passwords: PasswordHasher;
  tokens: TokenService;
  otp: OtpStore;
  rateLimiter: RateLimiter;
  denylist: TokenDenylist;
  events: EventPublisher;
  uow: UnitOfWork;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

export class IdentityService {
  constructor(private readonly deps: IdentityServiceDeps) {}

  async register(
    input: { name: string; email: string; phone: string; password: string },
    device: DeviceContext = {},
  ): Promise<AuthTokens> {
    assertEmail(input.email);
    assertPhone(input.phone);
    assertPasswordPolicy(input.password);

    const email = input.email.toLowerCase().trim();
    const phone = normalizePhone(input.phone);

    const passwordHash = await this.deps.passwords.hash(input.password);
    const user = await this.deps.uow.withTransaction(async (repos) => {
      if (await repos.users.findByEmail(email)) {
        throw new ConflictError('This email is already registered. Login instead?');
      }
      if (await repos.users.findByPhone(phone)) {
        throw new ConflictError('This phone is already registered.');
      }
      return repos.users.createUser({
        name: input.name.trim(),
        email,
        phone,
        passwordHash,
        role: Role.Customer,
      });
    });

    await this.deps.audit.append({
      action: 'user_registered',
      userId: user.id,
      ip: device.ip,
      ua: device.userAgent,
    });

    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: KafkaTopics.UserRegistered,
      key: user.id,
      payload: { userId: user.id, name: user.name, email: user.email },
      occurredAt: new Date().toISOString(),
    });

    return this.issueSession(user, device, 'login_success');
  }

  async loginPassword(
    input: { identifier: string; password: string },
    device: DeviceContext = {},
  ): Promise<AuthTokens> {
    const allowed = await this.deps.rateLimiter.hit(
      'login',
      input.identifier.toLowerCase(),
      LOGIN_LIMIT,
      LOGIN_WINDOW_SECONDS,
    );
    if (!allowed) {
      throw new RateLimitError('Too many attempts. Try again later.');
    }

    const user = await this.deps.users.findByEmailOrPhone(input.identifier.trim());
    if (!user) {
      await this.deps.audit.append({
        action: 'login_failure',
        ip: device.ip,
        ua: device.userAgent,
        metadata: { reason: 'not_found' },
      });
      throw new UnauthorizedError();
    }

    const hash = await this.deps.users.getPasswordHash(user.id);
    const ok = hash ? await this.deps.passwords.compare(input.password, hash) : false;
    if (!ok) {
      await this.deps.audit.append({
        action: 'login_failure',
        userId: user.id,
        ip: device.ip,
        ua: device.userAgent,
      });
      throw new UnauthorizedError();
    }

    return this.issueSession(user, device, 'login_success');
  }

  async requestOtp(
    input: { identifier: string; type: 'email' | 'phone' },
    device: DeviceContext = {},
  ): Promise<{ message: string; expiresIn: number }> {
    const idKey = input.identifier.toLowerCase().trim();
    const allowed = await this.deps.rateLimiter.hit(
      'otp_request',
      idKey,
      OTP_REQUEST_LIMIT,
      OTP_REQUEST_WINDOW_SECONDS,
    );
    if (!allowed) {
      throw new RateLimitError('Too many OTP requests. Try again later.');
    }

    const user = await this.deps.users.findByEmailOrPhone(input.identifier.trim());
    // Flow 2 — do not reveal whether identifier exists
    if (!user) {
      return { message: 'OTP sent', expiresIn: OTP_TTL_SECONDS };
    }

    const code = generateOtpCode();
    await this.deps.otp.set(user.id, hashOtp(code), OTP_TTL_SECONDS);
    await this.deps.otp.clearAttempts(user.id);

    await this.deps.audit.append({
      action: 'otp_request',
      userId: user.id,
      ip: device.ip,
      ua: device.userAgent,
      metadata: { type: input.type },
    });

    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: KafkaTopics.UserOtpRequested,
      key: user.id,
      payload: {
        userId: user.id,
        email: user.email,
        phone: user.phone,
        // Delivery is always email regardless of request type
        type: 'email',
        otpCode: code,
      },
      occurredAt: new Date().toISOString(),
    });

    return { message: 'OTP sent', expiresIn: OTP_TTL_SECONDS };
  }

  async verifyOtp(
    input: { identifier: string; code: string },
    device: DeviceContext = {},
  ): Promise<AuthTokens> {
    const user = await this.deps.users.findByEmailOrPhone(input.identifier.trim());
    if (!user) {
      throw new UnauthorizedError('Invalid code');
    }

    const attempts = await this.deps.otp.incrAttempts(user.id, OTP_TTL_SECONDS);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.deps.otp.del(user.id);
      await this.deps.otp.clearAttempts(user.id);
      throw new RateLimitError('Too many failed attempts. Request a new code.');
    }

    const stored = await this.deps.otp.get(user.id);
    if (!stored) {
      await this.deps.audit.append({
        action: 'otp_login_failure',
        userId: user.id,
        ip: device.ip,
        ua: device.userAgent,
        metadata: { reason: 'expired' },
      });
      throw new UnauthorizedError('Code expired');
    }

    if (!verifyOtpConstantTime(input.code, stored)) {
      await this.deps.audit.append({
        action: 'otp_login_failure',
        userId: user.id,
        ip: device.ip,
        ua: device.userAgent,
        metadata: { remaining: OTP_MAX_ATTEMPTS - attempts },
      });
      throw new UnauthorizedError(
        `Invalid code. ${Math.max(OTP_MAX_ATTEMPTS - attempts, 0)} attempts remaining.`,
      );
    }

    await this.deps.otp.del(user.id);
    await this.deps.otp.clearAttempts(user.id);

    return this.issueSession(user, device, 'otp_login_success');
  }

  /**
   * Refresh with rotation + reuse detection ( Documentation §8).
   * Presenting a previously rotated (revoked) token revokes the entire family.
   */
  async refresh(refreshToken: string, device: DeviceContext = {}): Promise<AuthTokens> {
    const tokenHash = hashOpaqueToken(refreshToken);
    const existing = await this.deps.refreshTokens.findByHash(tokenHash);

    if (!existing) {
      throw new UnauthorizedError('Your session expired. Please login again.');
    }

    if (existing.revokedAt) {
      await this.deps.refreshTokens.revokeFamily(existing.familyId);
      const session = await this.deps.sessions.findById(existing.sessionId);
      if (session?.accessJti) {
        await this.deps.denylist.revoke(session.accessJti, this.deps.accessTtlSeconds);
      }
      await this.deps.sessions.revoke(existing.sessionId);
      await this.deps.audit.append({
        action: 'refresh_reuse_detected',
        userId: existing.userId,
        targetSessionId: existing.sessionId,
        ip: device.ip,
        ua: device.userAgent,
      });
      throw new UnauthorizedError('Your session expired. Please login again.');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Your session expired. Please login again.');
    }

    await this.deps.refreshTokens.revoke(existing.id);

    const user = await this.deps.users.findById(existing.userId);
    if (!user) {
      throw new UnauthorizedError('Your session expired. Please login again.');
    }

    const access = this.deps.tokens.issueAccessToken(user);
    const newRefresh = this.deps.tokens.mintRefreshToken();
    await this.deps.refreshTokens.create({
      userId: user.id,
      sessionId: existing.sessionId,
      tokenHash: hashOpaqueToken(newRefresh),
      familyId: existing.familyId,
      expiresAt: new Date(Date.now() + this.deps.refreshTtlSeconds * 1000),
    });
    await this.deps.sessions.touch(existing.sessionId, access.jti);
    await this.deps.audit.append({
      action: 'token_refresh',
      userId: user.id,
      targetSessionId: existing.sessionId,
      ip: device.ip,
      ua: device.userAgent,
    });

    return { accessToken: access.token, refreshToken: newRefresh, user };
  }

  async logout(input: { accessJti?: string; refreshToken?: string }): Promise<{ message: string }> {
    if (input.accessJti) {
      await this.deps.denylist.revoke(input.accessJti, this.deps.accessTtlSeconds);
    }
    if (input.refreshToken) {
      const hash = hashOpaqueToken(input.refreshToken);
      const row = await this.deps.refreshTokens.findByHash(hash);
      if (row) {
        await this.deps.refreshTokens.revoke(row.id);
        await this.deps.sessions.revoke(row.sessionId);
        await this.deps.audit.append({
          action: 'logout',
          userId: row.userId,
          targetSessionId: row.sessionId,
        });
      }
    }
    return { message: 'Logged out' };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    const sessions = await this.deps.sessions.revokeAllForUser(userId);
    await this.deps.refreshTokens.revokeAllForUser(userId);
    for (const s of sessions) {
      if (s.accessJti) {
        await this.deps.denylist.revoke(s.accessJti, this.deps.accessTtlSeconds);
      }
    }
    await this.deps.audit.append({ action: 'logout_all', userId });
    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: KafkaTopics.SessionRevoked,
      key: userId,
      payload: { userId, all: true },
      occurredAt: new Date().toISOString(),
    });
    return { message: 'All sessions revoked' };
  }

  async introspectToken(accessToken: string): Promise<{
    active: boolean;
    userId?: string;
    role?: Role;
    jti?: string;
  }> {
    const payload = await this.deps.tokens.verifyAccessToken(accessToken);
    if (!payload) {
      return { active: false };
    }
    if (await this.deps.denylist.isRevoked(payload.jti)) {
      return { active: false };
    }
    return {
      active: true,
      userId: payload.userId,
      role: payload.role,
      jti: payload.jti,
    };
  }

  async assignRole(userId: string, role: Role): Promise<{ userId: string; role: Role }> {
    if (role !== Role.Admin && role !== Role.Customer) {
      throw new ValidationError('Role must be customer or admin');
    }
    const user = await this.deps.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const assigned = await this.deps.users.assignRole(userId, role);
    await this.deps.audit.append({
      action: 'role_assigned',
      userId,
      metadata: { role: assigned },
    });
    return { userId, role: assigned };
  }

  async getMe(userId: string): Promise<UserRecord> {
    const user = await this.deps.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  async listSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<
    Array<{
      id: string;
      device: string;
      ip: string;
      createdAt: string;
      lastActive: string;
      current: boolean;
    }>
  > {
    const sessions = await this.deps.sessions.listByUser(userId);
    return sessions
      .filter((s) => !s.revokedAt)
      .map((s) => ({
        id: s.id,
        device: s.deviceUa ?? 'Unknown device',
        ip: s.ip ?? '',
        createdAt: s.createdAt.toISOString(),
        lastActive: s.lastActive.toISOString(),
        current: currentSessionId ? s.id === currentSessionId : false,
      }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ message: string }> {
    const session = await this.deps.sessions.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new NotFoundError('Session not found');
    }
    await this.deps.refreshTokens.revokeBySession(sessionId);
    await this.deps.sessions.revoke(sessionId);
    if (session.accessJti) {
      await this.deps.denylist.revoke(session.accessJti, this.deps.accessTtlSeconds);
    }
    await this.deps.audit.append({
      action: 'session_revoked',
      userId,
      targetSessionId: sessionId,
    });
    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: KafkaTopics.SessionRevoked,
      key: userId,
      payload: { userId, sessionId },
      occurredAt: new Date().toISOString(),
    });
    return { message: 'Session revoked' };
  }

  private async issueSession(
    user: UserRecord,
    device: DeviceContext,
    auditAction: 'login_success' | 'otp_login_success',
  ): Promise<AuthTokens> {
    const access = this.deps.tokens.issueAccessToken(user);
    const refresh = this.deps.tokens.mintRefreshToken();
    const familyId = randomUUID();

    const session = await this.deps.sessions.create({
      userId: user.id,
      deviceUa: device.userAgent,
      ip: device.ip,
      accessJti: access.jti,
    });

    await this.deps.refreshTokens.create({
      userId: user.id,
      sessionId: session.id,
      tokenHash: hashOpaqueToken(refresh),
      familyId,
      expiresAt: new Date(Date.now() + this.deps.refreshTtlSeconds * 1000),
    });

    await this.deps.audit.append({
      action: auditAction,
      userId: user.id,
      targetSessionId: session.id,
      ip: device.ip,
      ua: device.userAgent,
    });

    return { accessToken: access.token, refreshToken: refresh, user };
  }
}

export type { SessionRecord };
