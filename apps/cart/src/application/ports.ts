import type { CartDto, CartItem } from '../domain/cart';

export interface VariantPrice {
  productId: string;
  variantId: string;
  label: string;
  unitPrice: string;
  isActive: boolean;
}

export interface CartStore {
  getItems(userId: string): Promise<CartItem[]>;
  saveItems(userId: string, items: CartItem[]): Promise<void>;
  clear(userId: string): Promise<void>;
  /** true if cart key existed (not expired) */
  exists(userId: string): Promise<boolean>;
}

export interface CartSnapshotRepository {
  upsert(userId: string, items: CartItem[], total: string): Promise<void>;
  delete(userId: string): Promise<void>;
}

export interface CatalogPriceLookup {
  getVariantPrice(productId: string, variantId: string): Promise<VariantPrice | null>;
}

export type { CartDto, CartItem };
