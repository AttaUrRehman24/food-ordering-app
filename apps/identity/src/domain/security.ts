import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { ValidationError } from './errors';

/**  Documentation §1.4 AC / §8 — OTP is 6 digits */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Article II.4 — OTP stored hashed; SHA256 as allowed by Flow 2 */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function verifyOtpConstantTime(code: string, storedHash: string): boolean {
  const incoming = Buffer.from(hashOtp(code), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (incoming.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(incoming, stored);
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Flow 1 — password min 8 chars */
export function assertPasswordPolicy(password: string): void {
  if (!password || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }
}

export function assertEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

export function assertPhone(phone: string): void {
  if (!/^\+?[0-9]{8,15}$/.test(phone.replace(/[\s-]/g, ''))) {
    throw new ValidationError('Invalid phone format');
  }
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}
