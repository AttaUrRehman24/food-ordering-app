import { randomUUID } from 'crypto';
import { OrderStatus, PaymentType } from '@food-ordering/domain';
import { OrderService } from './order.service';
import type {
  CartGateway,
  CartSnapshot,
  CatalogGateway,
  CheckoutLock,
  EventPublisher,
  OrderRepository,
  PaymentProvider,
  PricedLine,
} from './ports';
import type { OrderDto, OrderSummaryDto, PlaceOrderResult } from '../domain/types';
import { InMemoryCheckoutLock } from '../infrastructure/redis/checkout.lock';
import { CodPaymentProvider } from '../infrastructure/payment/payment.provider';
import { InMemoryEventPublisher } from '../infrastructure/messaging/kafka.workers';

class MemOrders implements OrderRepository {
  private byId = new Map<string, OrderDto>();
  private idem = new Map<string, PlaceOrderResult>();
  private outbox: Array<{ id: string; event: string; payload: Record<string, unknown>; published: boolean }> =
    [];

  async findIdempotency(key: string) {
    return this.idem.get(key) ?? null;
  }

  async placeOrder(input: {
    userId: string;
    paymentType: PaymentType;
    idempotencyKey: string;
    lines: PricedLine[];
    total: string;
  }) {
    const existing = this.idem.get(input.idempotencyKey);
    if (existing) {
      return existing;
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const order: OrderDto = {
      id,
      userId: input.userId,
      total: input.total,
      paymentType: input.paymentType,
      status: OrderStatus.Pending,
      createdAt,
      softDeleted: false,
      items: input.lines.map((l) => ({
        id: randomUUID(),
        variantId: l.variantId,
        productNameSnapshot: l.productNameSnapshot,
        variantLabelSnapshot: l.variantLabelSnapshot,
        unitPriceSnapshot: l.unitPriceSnapshot,
        quantity: l.quantity,
      })),
      statusHistory: [{ id: randomUUID(), status: OrderStatus.Pending, at: createdAt }],
    };
    this.byId.set(id, order);
    const result: PlaceOrderResult = {
      orderId: id,
      status: OrderStatus.Pending,
      total: input.total,
    };
    this.idem.set(input.idempotencyKey, result);
    this.outbox.push({
      id: randomUUID(),
      event: 'order.created',
      payload: { orderId: id, userId: input.userId },
      published: false,
    });
    return result;
  }

  async findById(orderId: string) {
    return this.byId.get(orderId) ?? null;
  }

  async listByUser(userId: string, page: number, limit: number) {
    const items = [...this.byId.values()]
      .filter((o) => o.userId === userId && !o.softDeleted)
      .map(
        (o): OrderSummaryDto => ({
          id: o.id,
          userId: o.userId,
          total: o.total,
          status: o.status,
          paymentType: o.paymentType,
          createdAt: o.createdAt,
          itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
        }),
      );
    return { items: items.slice((page - 1) * limit, page * limit), total: items.length };
  }

  async listAll(page: number, limit: number) {
    const items = [...this.byId.values()]
      .filter((o) => !o.softDeleted)
      .map(
        (o): OrderSummaryDto => ({
          id: o.id,
          userId: o.userId,
          total: o.total,
          status: o.status,
          paymentType: o.paymentType,
          createdAt: o.createdAt,
          itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
        }),
      );
    return { items: items.slice((page - 1) * limit, page * limit), total: items.length };
  }

  async cancel(input: { orderId: string; softDelete: boolean }) {
    const order = this.byId.get(input.orderId);
    if (!order) {
      throw new Error('missing');
    }
    order.status = OrderStatus.Cancelled;
    if (input.softDelete) {
      order.softDeleted = true;
    }
    return order;
  }

  async markStatus(input: { orderId: string; status: OrderStatus.Paid | OrderStatus.Failed }) {
    const order = this.byId.get(input.orderId);
    if (!order) {
      throw new Error('missing');
    }
    order.status = input.status;
    return order;
  }

  async claimOutboxBatch(limit: number) {
    return this.outbox.filter((o) => !o.published).slice(0, limit);
  }

  async markOutboxPublished(ids: string[]) {
    for (const o of this.outbox) {
      if (ids.includes(o.id)) {
        o.published = true;
      }
    }
  }
}

class MemCart implements CartGateway {
  cart: CartSnapshot = {
    userId: 'u1',
    items: [
      {
        productId: 'p1',
        variantId: 'v1',
        label: '8pc',
        unitPrice: '12.99',
        quantity: 2,
      },
    ],
    total: '25.98',
  };
  cleared = false;
  async getCart() {
    return this.cart;
  }
  async clearCart() {
    this.cleared = true;
    this.cart = { ...this.cart, items: [], total: '0' };
  }
}

class MemCatalog implements CatalogGateway {
  async resolveLine(productId: string, variantId: string) {
    if (variantId === 'dead') {
      return { productName: 'X', label: 'dead', unitPrice: '1', isActive: false };
    }
    return {
      productName: 'Chicken Wings',
      label: '8pc',
      unitPrice: '12.99',
      isActive: true,
    };
  }
}

function build(overrides?: {
  cart?: CartGateway;
  payment?: PaymentProvider;
  events?: EventPublisher;
  lock?: CheckoutLock;
}) {
  const orders = new MemOrders();
  const events = overrides?.events ?? new InMemoryEventPublisher();
  const service = new OrderService({
    orders,
    cart: overrides?.cart ?? new MemCart(),
    catalog: new MemCatalog(),
    lock: overrides?.lock ?? new InMemoryCheckoutLock(),
    payment: overrides?.payment ?? new CodPaymentProvider(),
    events,
  });
  return { service, orders, events: events as InMemoryEventPublisher };
}

describe('OrderService (FR-9/10 / §5.2 / TDR-6 / Q3)', () => {
  it('places order idempotently and clears cart', async () => {
    const cart = new MemCart();
    const { service } = build({ cart });
    const key = randomUUID();
    const first = await service.placeOrder({
      userId: 'u1',
      paymentType: 'COD',
      idempotencyKey: key,
    });
    const second = await service.placeOrder({
      userId: 'u1',
      paymentType: 'COD',
      idempotencyKey: key,
    });
    expect(first.orderId).toBe(second.orderId);
    expect(first.status).toBe(OrderStatus.Pending);
    expect(first.total).toBe('25.98');
    expect(cart.cleared).toBe(true);
  });

  it('rejects empty cart', async () => {
    const cart = new MemCart();
    cart.cart.items = [];
    const { service } = build({ cart });
    await expect(
      service.placeOrder({
        userId: 'u1',
        paymentType: 'COD',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('finalizes COD to paid', async () => {
    const { service, events } = build();
    const placed = await service.placeOrder({
      userId: 'u1',
      paymentType: 'COD',
      idempotencyKey: randomUUID(),
    });
    await service.finalizeOrder(placed.orderId);
    const order = await service.getOrder(placed.orderId, 'u1');
    expect(order.status).toBe(OrderStatus.Paid);
    expect(events.published.some((e) => e.topic === 'order.paid')).toBe(true);
  });

  it('allows customer cancel only while pending', async () => {
    const cart = new MemCart();
    const { service } = build({ cart });
    const placed = await service.placeOrder({
      userId: 'u1',
      paymentType: 'COD',
      idempotencyKey: randomUUID(),
    });
    const cancelled = await service.cancelOrder({
      orderId: placed.orderId,
      userId: 'u1',
      asAdmin: false,
    });
    expect(cancelled.status).toBe(OrderStatus.Cancelled);

    cart.cart = {
      userId: 'u1',
      items: [
        {
          productId: 'p1',
          variantId: 'v1',
          label: '8pc',
          unitPrice: '12.99',
          quantity: 1,
        },
      ],
      total: '12.99',
    };
    cart.cleared = false;

    const paid = await service.placeOrder({
      userId: 'u1',
      paymentType: 'COD',
      idempotencyKey: randomUUID(),
    });
    await service.finalizeOrder(paid.orderId);
    await expect(
      service.cancelOrder({ orderId: paid.orderId, userId: 'u1', asAdmin: false }),
    ).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('admin cancel soft-deletes', async () => {
    const { service } = build();
    const placed = await service.placeOrder({
      userId: 'u1',
      paymentType: 'COD',
      idempotencyKey: randomUUID(),
    });
    const cancelled = await service.cancelOrder({
      orderId: placed.orderId,
      userId: 'admin',
      asAdmin: true,
    });
    expect(cancelled.softDeleted).toBe(true);
  });
});
