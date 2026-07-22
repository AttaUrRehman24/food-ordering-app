import { CartService } from './cart.service';
import { InMemoryCartStore } from '../infrastructure/redis/redis-cart.store';
import { InMemoryCatalogPriceLookup } from '../infrastructure/catalog/grpc-catalog-price.lookup';
import type { CartItem } from '../domain/cart';
import type { CartSnapshotRepository } from './ports';

class MemSnapshot implements CartSnapshotRepository {
  snapshots = new Map<string, { items: CartItem[]; total: string }>();
  async upsert(userId: string, items: CartItem[], total: string) {
    this.snapshots.set(userId, { items, total });
  }
  async delete(userId: string) {
    this.snapshots.delete(userId);
  }
}

function build() {
  const catalog = new InMemoryCatalogPriceLookup();
  catalog.seed({
    productId: 'prod-wings',
    variantId: 'var-8pc',
    label: '8pc',
    unitPrice: '12.99',
    isActive: true,
  });
  catalog.seed({
    productId: 'prod-burger',
    variantId: 'var-double',
    label: 'Double',
    unitPrice: '12.49',
    isActive: true,
  });
  catalog.seed({
    productId: 'prod-gone',
    variantId: 'var-gone',
    label: 'Gone',
    unitPrice: '1.00',
    isActive: false,
  });

  const snapshot = new MemSnapshot();
  const service = new CartService({
    store: new InMemoryCartStore(),
    snapshot,
    catalog,
  });
  return { service, snapshot };
}

describe('CartService (FR-7/8 / §3.2 / TDR-5)', () => {
  it('adds items and recomputes total', async () => {
    const { service, snapshot } = build();
    const cart = await service.addItem('user-1', 'prod-wings', 'var-8pc', 1);
    expect(cart.itemCount).toBe(1);
    expect(cart.total).toBe('12.99');
    expect(snapshot.snapshots.get('user-1')?.total).toBe('12.99');
  });

  it('updates quantity and removes items', async () => {
    const { service } = build();
    await service.addItem('user-1', 'prod-wings', 'var-8pc', 1);
    await service.addItem('user-1', 'prod-burger', 'var-double', 2);
    const updated = await service.updateItem('user-1', 'prod-wings', 'var-8pc', 2);
    expect(updated.total).toBe((12.99 * 2 + 12.49 * 2).toFixed(2));
    const removed = await service.removeItem('user-1', 'prod-burger', 'var-double');
    expect(removed.itemCount).toBe(2);
    expect(removed.total).toBe((12.99 * 2).toFixed(2));
  });

  it('rejects inactive variants with 422 semantics', async () => {
    const { service } = build();
    await expect(
      service.addItem('user-1', 'prod-gone', 'var-gone', 1),
    ).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('clears cart and snapshot', async () => {
    const { service, snapshot } = build();
    await service.addItem('user-1', 'prod-wings', 'var-8pc', 1);
    const cleared = await service.clearCart('user-1');
    expect(cleared.items).toHaveLength(0);
    expect(snapshot.snapshots.has('user-1')).toBe(false);
  });
});
