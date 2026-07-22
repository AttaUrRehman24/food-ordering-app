import { Role } from '@food-ordering/domain';

/**
 * Shared JWT / RBAC contracts ( Documentation §8, Article I).
 * Concrete Nest guards and JWT verification land in later milestones.
 */

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  jti: string;
}

export interface AuthenticatedUser {
  userId: string;
  role: Role;
  jti: string;
}

/**  Documentation Article I.3 — only customer | admin */
export function isAdmin(role: Role): boolean {
  return role === Role.Admin;
}

export function isCustomer(role: Role): boolean {
  return role === Role.Customer;
}

export const RBAC_ROLES = [Role.Customer, Role.Admin] as const;
