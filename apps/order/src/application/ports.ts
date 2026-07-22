import { OrderStatus, PaymentType } from '@food-ordering/domain';
import type { KafkaMessageEnvelope } from '@food-ordering/kafka';
import type {
  OrderDto,
  OrderLineInput,
  OrderSummaryDto,
  PlaceOrderResult,
} from '../domain/types';

export interface CartLine {
  productId: string;
  variantId: string;
  label: string;
  unitPrice: string;
  quantity: number;
}

export interface CartSnapshot {
  userId: string;
  items: CartLine[];
  total: string;
}

export interface PricedLine extends OrderLineInput {
  productId: string;
}

export interface CartGateway {
  getCart(userId: string): Promise<CartSnapshot>;
  clearCart(userId: string): Promise<void>;
}

export interface CatalogGateway {
  resolveLine(
    productId: string,
    variantId: string,
  ): Promise<{
    productName: string;
    label: string;
    unitPrice: string;
    isActive: boolean;
  } | null>;
}

export interface CheckoutLock {
  acquire(userId: string, ttlMs: number): Promise<boolean>;
  release(userId: string): Promise<void>;
}

export interface PaymentResult {
  orderId: string;
  status: 'paid' | 'failed';
}

export interface PaymentProvider {
  charge(input: {
    orderId: string;
    userId: string;
    total: string;
    paymentType: PaymentType;
  }): Promise<PaymentResult>;
}

export interface EventPublisher {
  publish(message: KafkaMessageEnvelope): Promise<void>;
}

export interface OrderRepository {
  findIdempotency(key: string): Promise<PlaceOrderResult | null>;
  placeOrder(input: {
    userId: string;
    paymentType: PaymentType;
    idempotencyKey: string;
    lines: PricedLine[];
    total: string;
  }): Promise<PlaceOrderResult>;
  findById(orderId: string): Promise<OrderDto | null>;
  listByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: OrderSummaryDto[]; total: number }>;
  listAll(page: number, limit: number): Promise<{ items: OrderSummaryDto[]; total: number }>;
  cancel(input: {
    orderId: string;
    softDelete: boolean;
  }): Promise<OrderDto>;
  markStatus(input: {
    orderId: string;
    status: OrderStatus.Paid | OrderStatus.Failed;
  }): Promise<OrderDto>;
  claimOutboxBatch(limit: number): Promise<
    Array<{ id: string; event: string; payload: Record<string, unknown> }>
  >;
  markOutboxPublished(ids: string[]): Promise<void>;
}
