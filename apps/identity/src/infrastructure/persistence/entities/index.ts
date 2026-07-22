export { User } from './user.entity';
export { Credential } from './credential.entity';
export { Role } from './role.entity';
export { Session } from './session.entity';
export { RefreshToken } from './refresh-token.entity';
export { AuditLog } from './audit-log.entity';

import { User } from './user.entity';
import { Credential } from './credential.entity';
import { Role } from './role.entity';
import { Session } from './session.entity';
import { RefreshToken } from './refresh-token.entity';
import { AuditLog } from './audit-log.entity';

export const identityEntities = [User, Credential, Role, Session, RefreshToken, AuditLog];
