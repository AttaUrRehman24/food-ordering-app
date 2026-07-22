/**
 * Shared domain types and enums.
 * Source:  Documentation §1, §6, §8 — roles, order status, payment type.
 */

/**  Documentation §0 / Article I.3 — complete role set */
export enum Role {
  Customer = 'customer',
  Admin = 'admin',
}

/**  Documentation §1 FR-9 / §6 ORDERS.status */
export enum OrderStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/**  Documentation Flow 1 — payment type selector (COD / Card); TDR-6 pluggable seam */
export enum PaymentType {
  Cod = 'COD',
  Card = 'Card',
}

export interface Money {
  amount: number;
  currency?: string;
}

export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
}
