import { randomUUID } from 'crypto';
import { OrderStatus, PaymentType } from '@food-ordering/domain';
import { KafkaTopics } from '@food-ordering/kafka';
import {
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../domain/errors';
import type { OrderDto, OrderSummaryDto, PlaceOrderResult } from '../domain/types';
import type {
  CartGateway,
  CatalogGateway,
  CheckoutLock,
  EventPublisher,
  OrderRepository,
  PaymentProvider,
  PricedLine,
} from './ports';

export interface OrderServiceDeps {
  orders: OrderRepository;
  cart: CartGateway;
  catalog: CatalogGateway;
  lock: CheckoutLock;
  payment: PaymentProvider;
  events: EventPublisher;
}

export class OrderService {
  constructor(private readonly deps: OrderServiceDeps) {}

  async placeOrder(input: {
    userId: string;
    paymentType: string;
    idempotencyKey: string;
  }): Promise<PlaceOrderResult> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!input.idempotencyKey?.trim()) {
      throw new ValidationError('idempotencyKey is required');
    }
    const paymentType = this.parsePaymentType(input.paymentType);

    const existing = await this.deps.orders.findIdempotency(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const locked = await this.deps.lock.acquire(input.userId, 5_000);
    if (!locked) {
      throw new UnprocessableError('Checkout already in progress');
    }

    try {
      const again = await this.deps.orders.findIdempotency(input.idempotencyKey);
      if (again) {
        return again;
      }

      const cart = await this.deps.cart.getCart(input.userId);
      if (!cart.items.length) {
        throw new UnprocessableError('Your cart is empty.');
      }

      const lines: PricedLine[] = [];
      let total = 0;
      for (const item of cart.items) {
        const resolved = await this.deps.catalog.resolveLine(item.productId, item.variantId);
        if (!resolved || !resolved.isActive) {
          throw new UnprocessableError(
            `Sorry, ${item.label} is no longer available. Remove it?`,
          );
        }
        lines.push({
          productId: item.productId,
          variantId: item.variantId,
          productNameSnapshot: resolved.productName,
          variantLabelSnapshot: resolved.label,
          unitPriceSnapshot: resolved.unitPrice,
          quantity: item.quantity,
        });
        total += Number(resolved.unitPrice) * item.quantity;
      }

      const result = await this.deps.orders.placeOrder({
        userId: input.userId,
        paymentType,
        idempotencyKey: input.idempotencyKey,
        lines,
        total: total.toFixed(2),
      });

      await this.deps.cart.clearCart(input.userId);
      return result;
    } finally {
      await this.deps.lock.release(input.userId);
    }
  }

  async getOrder(orderId: string, userId: string, asAdmin = false): Promise<OrderDto> {
    const order = await this.deps.orders.findById(orderId);
    if (!order || (order.softDeleted && !asAdmin)) {
      throw new NotFoundError('Order not found');
    }
    if (!asAdmin && order.userId !== userId) {
      throw new ForbiddenError('Order not found');
    }
    return order;
  }

  async listMyOrders(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{ items: OrderSummaryDto[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const data = await this.deps.orders.listByUser(userId, safePage, safeLimit);
    return { ...data, page: safePage, limit: safeLimit };
  }

  async listAllOrders(
    page = 1,
    limit = 10,
  ): Promise<{ items: OrderSummaryDto[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const data = await this.deps.orders.listAll(safePage, safeLimit);
    return { ...data, page: safePage, limit: safeLimit };
  }

  async cancelOrder(input: {
    orderId: string;
    userId: string;
    asAdmin: boolean;
  }): Promise<OrderDto> {
    const order = await this.deps.orders.findById(input.orderId);
    if (!order || (order.softDeleted && !input.asAdmin)) {
      throw new NotFoundError('Order not found');
    }
    if (!input.asAdmin && order.userId !== input.userId) {
      throw new ForbiddenError('Order not found');
    }
    if (!input.asAdmin && order.status !== OrderStatus.Pending) {
      throw new UnprocessableError('Order already processed');
    }
    if (order.status === OrderStatus.Cancelled) {
      return order;
    }

    const cancelled = await this.deps.orders.cancel({
      orderId: input.orderId,
      softDelete: input.asAdmin,
    });

    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: KafkaTopics.OrderStatusChanged,
      key: cancelled.userId,
      payload: {
        orderId: cancelled.id,
        userId: cancelled.userId,
        status: OrderStatus.Cancelled,
      },
      occurredAt: new Date().toISOString(),
    });

    return cancelled;
  }

  /** Order finalizer worker — consume order.created ( Documentation §5.2) */
  async finalizeOrder(orderId: string): Promise<void> {
    const order = await this.deps.orders.findById(orderId);
    if (!order || order.status !== OrderStatus.Pending) {
      return;
    }

    const payment = await this.deps.payment.charge({
      orderId: order.id,
      userId: order.userId,
      total: order.total,
      paymentType: order.paymentType,
    });

    const status = payment.status === 'paid' ? OrderStatus.Paid : OrderStatus.Failed;
    const updated = await this.deps.orders.markStatus({ orderId, status });

    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: KafkaTopics.OrderStatusChanged,
      key: updated.userId,
      payload: { orderId: updated.id, userId: updated.userId, status },
      occurredAt: new Date().toISOString(),
    });

    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: status === OrderStatus.Paid ? KafkaTopics.OrderPaid : KafkaTopics.OrderFailed,
      key: updated.id,
      payload: {
        orderId: updated.id,
        userId: updated.userId,
        total: updated.total,
      },
      occurredAt: new Date().toISOString(),
    });
  }

  private parsePaymentType(value: string): PaymentType {
    if (value === PaymentType.Cod || value === 'COD') {
      return PaymentType.Cod;
    }
    if (value === PaymentType.Card || value === 'Card') {
      return PaymentType.Card;
    }
    throw new ValidationError('paymentType must be COD or Card');
  }
}
