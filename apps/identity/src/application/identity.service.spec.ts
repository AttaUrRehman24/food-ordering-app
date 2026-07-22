import { randomUUID } from 'crypto';
import { Role } from '@food-ordering/domain';
import type { KafkaMessageEnvelope } from '@food-ordering/kafka';
import { IdentityService } from './identity.service';
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
import type {
  AuditAction,
  RefreshTokenRecord,
  SessionRecord,
  UserRecord,
} from '../domain/types';
import { hashOpaqueToken } from '../domain/security';

class MemUsers implements UserRepository {
  users = new Map<string, UserRecord>();
  passwords = new Map<string, string>();

  async findById(id: string) {
    return this.users.get(id) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findByPhone(phone: string) {
    return [...this.users.values()].find((u) => u.phone === phone) ?? null;
  }
  async findByEmailOrPhone(identifier: string) {
    const id = identifier.trim().toLowerCase();
    return (
      [...this.users.values()].find(
        (u) => u.email === id || u.phone === identifier.replace(/[\s-]/g, ''),
      ) ?? null
    );
  }
  async createUser(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    role: Role;
  }) {
    const user: UserRecord = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      phone: input.phone,
      createdAt: new Date(),
      role: input.role,
    };
    this.users.set(user.id, user);
    this.passwords.set(user.id, input.passwordHash);
    return user;
  }
  async getPasswordHash(userId: string) {
    return this.passwords.get(userId) ?? null;
  }
  async assignRole(userId: string, role: Role) {
    const u = this.users.get(userId);
    if (u) {
      u.role = role;
    }
    return role;
  }
  async ensureAdminSeed(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
  }) {
    const user = await this.createUser({ ...input, role: Role.Admin });
    return { user, created: true };
  }
}

class MemSessions implements SessionRepository {
  sessions = new Map<string, SessionRecord>();
  async create(input: {
    userId: string;
    deviceUa?: string;
    ip?: string;
    accessJti: string;
  }) {
    const s: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      deviceUa: input.deviceUa ?? null,
      ip: input.ip ?? null,
      accessJti: input.accessJti,
      createdAt: new Date(),
      lastActive: new Date(),
      revokedAt: null,
    };
    this.sessions.set(s.id, s);
    return s;
  }
  async findById(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async listByUser(userId: string) {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }
  async touch(sessionId: string, accessJti?: string) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.lastActive = new Date();
      if (accessJti) {
        s.accessJti = accessJti;
      }
    }
  }
  async revoke(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.revokedAt = new Date();
    }
  }
  async revokeAllForUser(userId: string) {
    const out: SessionRecord[] = [];
    for (const s of this.sessions.values()) {
      if (s.userId === userId && !s.revokedAt) {
        s.revokedAt = new Date();
        out.push(s);
      }
    }
    return out;
  }
}

class MemRefresh implements RefreshTokenRepository {
  tokens = new Map<string, RefreshTokenRecord>();
  async create(input: {
    userId: string;
    sessionId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }) {
    const t: RefreshTokenRecord = {
      id: randomUUID(),
      ...input,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.tokens.set(t.tokenHash, t);
    return t;
  }
  async findByHash(tokenHash: string) {
    return this.tokens.get(tokenHash) ?? null;
  }
  async revoke(tokenId: string) {
    for (const t of this.tokens.values()) {
      if (t.id === tokenId) {
        t.revokedAt = new Date();
      }
    }
  }
  async revokeFamily(familyId: string) {
    for (const t of this.tokens.values()) {
      if (t.familyId === familyId) {
        t.revokedAt = new Date();
      }
    }
  }
  async revokeBySession(sessionId: string) {
    for (const t of this.tokens.values()) {
      if (t.sessionId === sessionId) {
        t.revokedAt = new Date();
      }
    }
  }
  async revokeAllForUser(userId: string) {
    for (const t of this.tokens.values()) {
      if (t.userId === userId) {
        t.revokedAt = new Date();
      }
    }
  }
}

class MemAudit implements AuditRepository {
  entries: Array<{ action: AuditAction }> = [];
  async append(input: { action: AuditAction }) {
    this.entries.push(input);
  }
}

class MemOtp implements OtpStore {
  store = new Map<string, string>();
  attempts = new Map<string, number>();
  async set(userId: string, hash: string) {
    this.store.set(userId, hash);
  }
  async get(userId: string) {
    return this.store.get(userId) ?? null;
  }
  async del(userId: string) {
    this.store.delete(userId);
  }
  async incrAttempts(userId: string) {
    const n = (this.attempts.get(userId) ?? 0) + 1;
    this.attempts.set(userId, n);
    return n;
  }
  async clearAttempts(userId: string) {
    this.attempts.delete(userId);
  }
}

class MemRate implements RateLimiter {
  async hit() {
    return true;
  }
}

class MemDeny implements TokenDenylist {
  set = new Set<string>();
  async revoke(jti: string) {
    this.set.add(jti);
  }
  async isRevoked(jti: string) {
    return this.set.has(jti);
  }
}

class MemEvents implements EventPublisher {
  published: KafkaMessageEnvelope[] = [];
  async publish(message: KafkaMessageEnvelope) {
    this.published.push(message);
  }
}

class PlainHasher implements PasswordHasher {
  async hash(password: string) {
    return `hash:${password}`;
  }
  async compare(password: string, hash: string) {
    return hash === `hash:${password}`;
  }
}

class SimpleTokens implements TokenService {
  issueAccessToken(user: UserRecord) {
    const jti = randomUUID();
    return {
      token: `access.${user.id}.${jti}`,
      jti,
      expiresAt: new Date(Date.now() + 900_000),
    };
  }
  async verifyAccessToken(token: string) {
    const parts = token.split('.');
    if (parts.length < 3) {
      return null;
    }
    return {
      userId: parts[1],
      role: Role.Customer,
      jti: parts[2],
      exp: Math.floor(Date.now() / 1000) + 900,
    };
  }
  mintRefreshToken() {
    return randomUUID();
  }
}

function buildService() {
  const users = new MemUsers();
  const sessions = new MemSessions();
  const refreshTokens = new MemRefresh();
  const audit = new MemAudit();
  const events = new MemEvents();
  const uow: UnitOfWork = {
    async withTransaction(fn) {
      return fn({ users, sessions, refreshTokens, audit });
    },
  };
  const service = new IdentityService({
    users,
    sessions,
    refreshTokens,
    audit,
    passwords: new PlainHasher(),
    tokens: new SimpleTokens(),
    otp: new MemOtp(),
    rateLimiter: new MemRate(),
    denylist: new MemDeny(),
    events,
    uow,
    accessTtlSeconds: 900,
    refreshTtlSeconds: 2592000,
  });
  return { service, users, refreshTokens, events, audit };
}

describe('IdentityService (FR-1..4 / §8)', () => {
  it('registers a customer and emits user.registered', async () => {
    const { service, events } = buildService();
    const tokens = await service.register({
      name: 'Ahmed',
      email: 'ahmed@example.com',
      phone: '+923001234567',
      password: 'password1',
    });
    expect(tokens.user.role).toBe(Role.Customer);
    expect(tokens.accessToken).toBeTruthy();
    expect(events.published.some((e) => e.topic === 'user.registered')).toBe(true);
  });

  it('does not create admin via register', async () => {
    const { service } = buildService();
    const tokens = await service.register({
      name: 'X',
      email: 'x@example.com',
      phone: '+11111111111',
      password: 'password1',
    });
    expect(tokens.user.role).toBe(Role.Customer);
  });

  it('logs in with password', async () => {
    const { service } = buildService();
    await service.register({
      name: 'A',
      email: 'a@example.com',
      phone: '+12222222222',
      password: 'password1',
    });
    const tokens = await service.loginPassword({
      identifier: 'a@example.com',
      password: 'password1',
    });
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { service, refreshTokens } = buildService();
    const first = await service.register({
      name: 'A',
      email: 'r@example.com',
      phone: '+13333333333',
      password: 'password1',
    });
    const second = await service.refresh(first.refreshToken);
    expect(second.accessToken).not.toBe(first.accessToken);

    await expect(service.refresh(first.refreshToken)).rejects.toThrow(/session expired/i);

    const oldHash = hashOpaqueToken(first.refreshToken);
    const old = await refreshTokens.findByHash(oldHash);
    expect(old?.revokedAt).toBeTruthy();
  });
});
