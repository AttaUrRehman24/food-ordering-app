import { randomUUID } from 'crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { generateKeyPairSync } from 'crypto';
import { join } from 'path';
import * as jwt from 'jsonwebtoken';
import { Role } from '@food-ordering/domain';
import type { TokenService } from '../../application/ports';
import type { UserRecord } from '../../domain/types';

/**  Documentation §8 — short-lived access JWT (RS256) */
export class JwtTokenService implements TokenService {
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor(
    private readonly accessTtlSeconds: number,
    keysDir = join(process.cwd(), 'apps/identity/keys'),
  ) {
    const privPath = process.env.JWT_PRIVATE_KEY_PATH ?? join(keysDir, 'jwt-private.pem');
    const pubPath = process.env.JWT_PUBLIC_KEY_PATH ?? join(keysDir, 'jwt-public.pem');

    if (!existsSync(privPath) || !existsSync(pubPath)) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT RSA keys missing (Article III.4 — provide via secrets manager)');
      }
      mkdirSync(keysDir, { recursive: true });
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      writeFileSync(privPath, privateKey);
      writeFileSync(pubPath, publicKey);
    }

    this.privateKey = readFileSync(privPath, 'utf8');
    this.publicKey = readFileSync(pubPath, 'utf8');
  }

  issueAccessToken(user: UserRecord): { token: string; jti: string; expiresAt: Date } {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + this.accessTtlSeconds * 1000);
    const token = jwt.sign(
      { sub: user.id, role: user.role, jti },
      this.privateKey,
      { algorithm: 'RS256', expiresIn: this.accessTtlSeconds },
    );
    return { token, jti, expiresAt };
  }

  async verifyAccessToken(token: string): Promise<{
    userId: string;
    role: Role;
    jti: string;
    exp: number;
  } | null> {
    try {
      const payload = jwt.verify(token, this.publicKey, { algorithms: ['RS256'] }) as {
        sub: string;
        role: Role;
        jti: string;
        exp: number;
      };
      return { userId: payload.sub, role: payload.role, jti: payload.jti, exp: payload.exp };
    } catch {
      return null;
    }
  }

  mintRefreshToken(): string {
    return randomUUID();
  }

  getPublicKey(): string {
    return this.publicKey;
  }
}
