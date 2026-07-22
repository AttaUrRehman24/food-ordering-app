import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { Role as AppRole } from '@food-ordering/domain';
import type {
  AuditRepository,
  RefreshTokenRepository,
  SessionRepository,
  UnitOfWork,
  UserRepository,
} from '../../application/ports';
import type {
  AuditAction,
  RefreshTokenRecord,
  SessionRecord,
  UserRecord,
} from '../../domain/types';
import { User } from './entities/user.entity';
import { Credential } from './entities/credential.entity';
import { Role } from './entities/role.entity';
import { Session } from './entities/session.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditLog } from './entities/audit-log.entity';

function mapUser(entity: User): UserRecord {
  const roleName = entity.roles?.[0]?.name ?? AppRole.Customer;
  return {
    id: entity.id,
    name: entity.name,
    email: entity.email,
    phone: entity.phone,
    createdAt: entity.createdAt,
    role: roleName as AppRole,
  };
}

function mapSession(entity: Session): SessionRecord {
  return {
    id: entity.id,
    userId: entity.userId,
    deviceUa: entity.deviceUa,
    ip: entity.ip,
    accessJti: entity.accessJti,
    createdAt: entity.createdAt,
    lastActive: entity.lastActive,
    revokedAt: entity.revokedAt,
  };
}

function mapRefresh(entity: RefreshToken): RefreshTokenRecord {
  return {
    id: entity.id,
    userId: entity.userId,
    sessionId: entity.sessionId,
    tokenHash: entity.tokenHash,
    familyId: entity.familyId,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt,
    createdAt: entity.createdAt,
  };
}

export class TypeOrmUserRepository implements UserRepository {
  constructor(private readonly em: EntityManager) {}

  private users() {
    return this.em.getRepository(User);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.users().findOne({ where: { id }, relations: { roles: true } });
    return user ? mapUser(user) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.users().findOne({ where: { email }, relations: { roles: true } });
    return user ? mapUser(user) : null;
  }

  async findByPhone(phone: string): Promise<UserRecord | null> {
    const user = await this.users().findOne({ where: { phone }, relations: { roles: true } });
    return user ? mapUser(user) : null;
  }

  async findByEmailOrPhone(identifier: string): Promise<UserRecord | null> {
    const id = identifier.trim();
    const email = id.toLowerCase();
    const phone = id.replace(/[\s-]/g, '');
    const user = await this.users()
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles')
      .where('u.email = :email OR u.phone = :phone', { email, phone })
      .getOne();
    return user ? mapUser(user) : null;
  }

  async createUser(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    role: AppRole;
  }): Promise<UserRecord> {
    const roleRepo = this.em.getRepository(Role);
    const role = await roleRepo.findOneByOrFail({ name: input.role });

    const user = this.users().create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      roles: [role],
    });
    const saved = await this.users().save(user);

    const credential = this.em.getRepository(Credential).create({
      userId: saved.id,
      passwordHash: input.passwordHash,
    });
    await this.em.getRepository(Credential).save(credential);

    saved.roles = [role];
    return mapUser(saved);
  }

  async getPasswordHash(userId: string): Promise<string | null> {
    const cred = await this.em.getRepository(Credential).findOneBy({ userId });
    return cred?.passwordHash ?? null;
  }

  async assignRole(userId: string, role: AppRole): Promise<AppRole> {
    const user = await this.users().findOneOrFail({
      where: { id: userId },
      relations: { roles: true },
    });
    const roleRow = await this.em.getRepository(Role).findOneByOrFail({ name: role });
    user.roles = [roleRow];
    await this.users().save(user);
    return role;
  }

  async ensureAdminSeed(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
  }): Promise<{ user: UserRecord; created: boolean }> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      return { user: existing, created: false };
    }
    const user = await this.createUser({
      ...input,
      role: AppRole.Admin,
    });
    return { user, created: true };
  }
}

export class TypeOrmSessionRepository implements SessionRepository {
  constructor(private readonly em: EntityManager) {}

  private sessions() {
    return this.em.getRepository(Session);
  }

  async create(input: {
    userId: string;
    deviceUa?: string;
    ip?: string;
    accessJti: string;
  }): Promise<SessionRecord> {
    const entity = this.sessions().create({
      userId: input.userId,
      deviceUa: input.deviceUa ?? null,
      ip: input.ip ?? null,
      accessJti: input.accessJti,
      lastActive: new Date(),
    });
    const saved = await this.sessions().save(entity);
    return mapSession(saved);
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const s = await this.sessions().findOneBy({ id: sessionId });
    return s ? mapSession(s) : null;
  }

  async listByUser(userId: string): Promise<SessionRecord[]> {
    const rows = await this.sessions().find({
      where: { userId },
      order: { lastActive: 'DESC' },
    });
    return rows.map(mapSession);
  }

  async touch(sessionId: string, accessJti?: string): Promise<void> {
    await this.sessions().update(
      { id: sessionId },
      {
        lastActive: new Date(),
        ...(accessJti ? { accessJti } : {}),
      },
    );
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessions().update(
      { id: sessionId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForUser(userId: string): Promise<SessionRecord[]> {
    const active = await this.sessions().find({
      where: { userId, revokedAt: IsNull() },
    });
    if (active.length === 0) {
      return [];
    }
    await this.sessions().update(
      { id: In(active.map((s) => s.id)) },
      { revokedAt: new Date() },
    );
    return active.map((s) => ({ ...mapSession(s), revokedAt: new Date() }));
  }
}

export class TypeOrmRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly em: EntityManager) {}

  private tokens() {
    return this.em.getRepository(RefreshToken);
  }

  async create(input: {
    userId: string;
    sessionId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    const entity = this.tokens().create(input);
    const saved = await this.tokens().save(entity);
    return mapRefresh(saved);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const t = await this.tokens().findOneBy({ tokenHash });
    return t ? mapRefresh(t) : null;
  }

  async revoke(tokenId: string): Promise<void> {
    await this.tokens().update({ id: tokenId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.tokens().update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeBySession(sessionId: string): Promise<void> {
    await this.tokens().update({ sessionId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.tokens().update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}

export class TypeOrmAuditRepository implements AuditRepository {
  constructor(private readonly em: EntityManager) {}

  async append(input: {
    action: AuditAction;
    userId?: string | null;
    targetSessionId?: string | null;
    ip?: string;
    ua?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const repo = this.em.getRepository(AuditLog);
    await repo.save(
      repo.create({
        action: input.action,
        userId: input.userId ?? null,
        targetSessionId: input.targetSessionId ?? null,
        ip: input.ip ?? null,
        ua: input.ua ?? null,
        metadata: input.metadata ?? {},
      }),
    );
  }
}

export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  async withTransaction<T>(
    fn: (repos: {
      users: UserRepository;
      sessions: SessionRepository;
      refreshTokens: RefreshTokenRepository;
      audit: AuditRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (em) =>
      fn({
        users: new TypeOrmUserRepository(em),
        sessions: new TypeOrmSessionRepository(em),
        refreshTokens: new TypeOrmRefreshTokenRepository(em),
        audit: new TypeOrmAuditRepository(em),
      }),
    );
  }
}
