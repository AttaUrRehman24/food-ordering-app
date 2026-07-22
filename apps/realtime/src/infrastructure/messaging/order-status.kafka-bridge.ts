import { Kafka, logLevel, type Consumer } from 'kafkajs';
import { KafkaTopics } from '@food-ordering/kafka';
import type { OrderStatusPubSub } from '../redis/presence-pubsub';
import { createStructuredLog, logJson } from '@food-ordering/observability';

/**
 *  Documentation §10 / §23 — Kafka order.status.changed → Redis Pub/Sub channel:order:{userId}
 */
export class OrderStatusKafkaBridge {
  private consumer: Consumer | null = null;

  constructor(
    private readonly brokers: string[],
    private readonly clientId: string,
    private readonly pubSub: OrderStatusPubSub,
  ) {}

  async start(): Promise<void> {
    const kafka = new Kafka({
      clientId: `${this.clientId}-status-bridge`,
      brokers: this.brokers,
      logLevel: logLevel.ERROR,
    });
    this.consumer = kafka.consumer({ groupId: 'realtime-order-status' });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KafkaTopics.OrderStatusChanged,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }
        try {
          const envelope = JSON.parse(message.value.toString()) as {
            payload?: Record<string, unknown>;
          };
          const payload = envelope.payload ?? {};
          const userId = String(payload.userId ?? '');
          if (!userId) {
            return;
          }
          await this.pubSub.publishStatus(userId, {
            orderId: payload.orderId,
            status: payload.status,
            at: payload.at ?? new Date().toISOString(),
          });
        } catch (err) {
          logJson(
            createStructuredLog('realtime', 'error', 'status bridge failed', null, {
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      },
    });
  }

  async stop(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
