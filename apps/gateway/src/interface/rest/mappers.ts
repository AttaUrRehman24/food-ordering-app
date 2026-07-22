import type { Response } from 'express';
import { REFRESH_COOKIE } from '../../auth/auth.guards';

const REFRESH_MAX_AGE = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2592000);

/** Article VII.2 — refresh as httpOnly Secure SameSite=Strict cookie */
export function setRefreshCookie(res: Response, refreshToken: string): void {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/v1/auth',
    maxAge: REFRESH_MAX_AGE * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/v1/auth',
  });
}

export function mapUser(u: {
  id: string;
  name: string;
  email: string;
  phone: string;
  role?: string;
  createdAt?: string;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    ...(u.role ? { role: u.role } : {}),
    ...(u.createdAt ? { createdAt: u.createdAt } : {}),
  };
}

export function mapAuthTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    createdAt?: string;
  };
}) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: mapUser(tokens.user),
  };
}

export function mapProduct(p: {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  imageUrl: string;
  variants: Array<{
    id: string;
    productId: string;
    label: string;
    price: string;
    isActive: boolean;
  }>;
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    imageUrl: p.imageUrl || null,
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      productId: v.productId,
      label: v.label,
      price: v.price,
      isActive: v.isActive,
    })),
  };
}

export function mapCart(c: {
  userId: string;
  items: Array<{
    productId: string;
    variantId: string;
    label: string;
    unitPrice: string;
    quantity: number;
  }>;
  total: string;
  itemCount: number;
}) {
  return {
    items: (c.items ?? []).map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      label: i.label,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
    })),
    total: c.total,
    itemCount: c.itemCount,
  };
}
