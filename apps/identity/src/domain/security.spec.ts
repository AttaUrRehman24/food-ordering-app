import {
  assertPasswordPolicy,
  generateOtpCode,
  hashOtp,
  verifyOtpConstantTime,
} from '../domain/security';
import { ValidationError } from '../domain/errors';

describe('identity security domain (§8 / Article II)', () => {
  it('generates 6-digit OTP', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('verifies OTP with constant-time hash compare', () => {
    const code = '847291';
    const hash = hashOtp(code);
    expect(verifyOtpConstantTime(code, hash)).toBe(true);
    expect(verifyOtpConstantTime('000000', hash)).toBe(false);
  });

  it('enforces password min length 8', () => {
    expect(() => assertPasswordPolicy('short')).toThrow(ValidationError);
    expect(() => assertPasswordPolicy('longenough')).not.toThrow();
  });
});
