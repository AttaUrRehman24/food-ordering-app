import * as bcrypt from 'bcrypt';
import type { PasswordHasher } from '../../application/ports';

/**  Documentation §8 / NFR-6 — bcrypt cost ≥ 12 */
const BCRYPT_COST = 12;

export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
