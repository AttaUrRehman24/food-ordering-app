/**
 * Kafka topic contracts + outbox relay surface ( Documentation §5.1, Article II.5).
 * Producer/consumer implementations land with Order / Identity / Notification.
 */

/**  Documentation §5.1 — topic design */
export const KafkaTopics = {
  OrderCreated: 'order.created',
  OrderStatusChanged: 'order.status.changed',
  OrderPaid: 'order.paid',
  OrderFailed: 'order.failed',
  PaymentResult: 'payment.result',
  UserOtpRequested: 'user.otp.requested',
  UserRegistered: 'user.registered',
  /**  Documentation §3.2 Identity events produced */
  SessionRevoked: 'session.revoked',
  CatalogProductChanged: 'catalog.product.changed',
} as const;

export type KafkaTopic = (typeof KafkaTopics)[keyof typeof KafkaTopics];

export interface OutboxRecord {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  publishedAt: Date | null;
}

export interface KafkaMessageEnvelope<T = Record<string, unknown>> {
  eventId: string;
  topic: KafkaTopic | string;
  key: string;
  payload: T;
  traceId?: string;
  occurredAt: string;
}

/** Stub — real KafkaJS wiring in later milestones */
export interface KafkaProducerPort {
  publish(message: KafkaMessageEnvelope): Promise<void>;
}

/** Stub — outbox relay polls unpublished rows and publishes (Article II.5) */
export interface OutboxRelayPort {
  publishPending(batchSize: number): Promise<number>;
}
