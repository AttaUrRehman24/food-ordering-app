import { DataSource } from 'typeorm';
import { BcryptPasswordHasher } from '../crypto/bcrypt-password.hasher';
import { TypeOrmUserRepository } from './typeorm.repositories';
import { createStructuredLog, logJson } from '@food-ordering/observability';

/**
 * Default admin seeder via TypeORM (clarification Q2).
 * Admin cannot register via Register RPC — customers only.
 */
export async function seedAdmin(dataSource: DataSource): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? 'admin@foodordering.local';
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe_Admin_Seed_Only';
  const phone = process.env.ADMIN_PHONE ?? '+10000000000';
  const name = process.env.ADMIN_NAME ?? 'System Admin';

  const hasher = new BcryptPasswordHasher();
  const users = new TypeOrmUserRepository(dataSource.manager);
  const passwordHash = await hasher.hash(password);
  const result = await users.ensureAdminSeed({ name, email, phone, passwordHash });

  logJson(
    createStructuredLog(
      'identity',
      'info',
      result.created ? 'admin user seeded' : 'admin user exists',
      null,
      { email, userId: result.user.id },
    ),
  );
}
