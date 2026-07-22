import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as jwt from 'jsonwebtoken';

export type AccessClaims = {
  userId: string;
  role: string;
  jti: string;
  exp: number;
};

/**
 *  Documentation §10 / §8 — JWT-authenticated WebSocket connect (RS256 public key).
 * Shares Identity public key path (JWT_PUBLIC_KEY_PATH).
 */
export class JwtAccessVerifier {
  private readonly publicKey: string;

  constructor(
    keysDir = join(process.cwd(), 'apps/identity/keys'),
  ) {
    const pubPath = process.env.JWT_PUBLIC_KEY_PATH ?? join(keysDir, 'jwt-public.pem');
    if (!existsSync(pubPath)) {
      throw new Error(
        `JWT public key missing at ${pubPath} — start Identity once to generate dev keys, or set JWT_PUBLIC_KEY_PATH`,
      );
    }
    this.publicKey = readFileSync(pubPath, 'utf8');
  }

  verify(token: string): AccessClaims | null {
    try {
      const payload = jwt.verify(token, this.publicKey, { algorithms: ['RS256'] }) as {
        sub: string;
        role: string;
        jti: string;
        exp: number;
      };
      return { userId: payload.sub, role: payload.role, jti: payload.jti, exp: payload.exp };
    } catch {
      return null;
    }
  }
}
