import {
  itemKey,
  toCartDto,
  type CartDto,
  type CartItem,
} from '../domain/cart';
import { NotFoundError, UnprocessableError, ValidationError } from '../domain/errors';
import type { CartSnapshotRepository, CartStore, CatalogPriceLookup } from './ports';

export interface CartServiceDeps {
  store: CartStore;
  snapshot: CartSnapshotRepository;
  catalog: CatalogPriceLookup;
}

export class CartService {
  constructor(private readonly deps: CartServiceDeps) {}

  async getCart(userId: string): Promise<CartDto> {
    this.assertUserId(userId);
    const exists = await this.deps.store.exists(userId);
    if (!exists) {
      // Empty cart is valid; expired cart → Flow 7 404
      const items = await this.deps.store.getItems(userId);
      if (items.length === 0) {
        // Distinguish never-created vs expired: treat missing key with no recovery as empty OK for get
        // Flow 7: "Cart expired (Redis TTL) → 404" — only when client expects existing cart.
        // GetCart for new user returns empty cart (standard UX).
        return toCartDto(userId, []);
      }
    }
    const items = await this.deps.store.getItems(userId);
    return toCartDto(userId, items);
  }

  async addItem(
    userId: string,
    productId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartDto> {
    this.assertUserId(userId);
    this.assertQuantity(quantity);

    const price = await this.resolveActiveVariant(productId, variantId);
    const items = await this.deps.store.getItems(userId);
    const key = itemKey(productId, variantId);
    const existing = items.find((i) => itemKey(i.productId, i.variantId) === key);

    if (existing) {
      existing.quantity += quantity;
      existing.unitPrice = price.unitPrice;
      existing.label = price.label;
    } else {
      items.push({
        productId,
        variantId,
        label: price.label,
        unitPrice: price.unitPrice,
        quantity,
      });
    }

    return this.persist(userId, items);
  }

  async updateItem(
    userId: string,
    productId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartDto> {
    this.assertUserId(userId);
    this.assertQuantity(quantity);

    const items = await this.deps.store.getItems(userId);
    const key = itemKey(productId, variantId);
    const existing = items.find((i) => itemKey(i.productId, i.variantId) === key);
    if (!existing) {
      throw new NotFoundError('Cart item not found');
    }

    const price = await this.resolveActiveVariant(productId, variantId);
    existing.quantity = quantity;
    existing.unitPrice = price.unitPrice;
    existing.label = price.label;

    return this.persist(userId, items);
  }

  async removeItem(userId: string, productId: string, variantId: string): Promise<CartDto> {
    this.assertUserId(userId);
    const items = await this.deps.store.getItems(userId);
    const key = itemKey(productId, variantId);
    const next = items.filter((i) => itemKey(i.productId, i.variantId) !== key);
    if (next.length === items.length) {
      throw new NotFoundError('Cart item not found');
    }
    return this.persist(userId, next);
  }

  async clearCart(userId: string): Promise<CartDto> {
    this.assertUserId(userId);
    await this.deps.store.clear(userId);
    await this.deps.snapshot.delete(userId);
    return toCartDto(userId, []);
  }

  /** Re-price all lines from Catalog (server-side) */
  async priceCart(userId: string): Promise<CartDto> {
    this.assertUserId(userId);
    const items = await this.deps.store.getItems(userId);
    const priced: CartItem[] = [];
    for (const item of items) {
      const price = await this.resolveActiveVariant(item.productId, item.variantId);
      priced.push({
        ...item,
        label: price.label,
        unitPrice: price.unitPrice,
      });
    }
    return this.persist(userId, priced);
  }

  private async persist(userId: string, items: CartItem[]): Promise<CartDto> {
    await this.deps.store.saveItems(userId, items);
    const cart = toCartDto(userId, items);
    await this.deps.snapshot.upsert(userId, items, cart.total);
    return cart;
  }

  private async resolveActiveVariant(
    productId: string,
    variantId: string,
  ): Promise<{ label: string; unitPrice: string }> {
    const variant = await this.deps.catalog.getVariantPrice(productId, variantId);
    if (!variant || !variant.isActive) {
      throw new UnprocessableError(
        `Sorry, variant ${variantId} is no longer available. Remove it?`,
      );
    }
    return { label: variant.label, unitPrice: variant.unitPrice };
  }

  private assertUserId(userId: string): void {
    if (!userId?.trim()) {
      throw new ValidationError('userId is required');
    }
  }

  private assertQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError('quantity must be a positive integer');
    }
  }
}
