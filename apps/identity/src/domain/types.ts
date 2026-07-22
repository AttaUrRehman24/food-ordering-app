import { Role } from '@food-ordering/domain';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Date;
  role: Role;
}

export interface SessionRecord {
  id: string;
  userId: string;
  deviceUa: string | null;
  ip: string | null;
  accessJti: string | null;
  createdAt: Date;
  lastActive: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  sessionId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface DeviceContext {
  ip?: string;
  userAgent?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserRecord;
}

export type AuditAction =
  | 'user_registered'
  | 'login_success'
  | 'login_failure'
  | 'otp_request'
  | 'otp_login_success'
  | 'otp_login_failure'
  | 'logout'
  | 'logout_all'
  | 'session_revoked'
  | 'token_refresh'
  | 'refresh_reuse_detected'
  | 'role_assigned';
