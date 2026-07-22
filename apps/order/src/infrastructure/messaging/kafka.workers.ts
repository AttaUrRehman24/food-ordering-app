import { Kafka, type Consumer, type Producer, logLevel } from 'kafkajs';
import type { KafkaMessageEnvelope } from '@food-ordering/kafka';
import { KafkaTopics } from '@food-ordering/kafka';
import type { EventPublisher, OrderRepository } from '../../application/ports';
import type { OrderService } from '../../application/order.service';
import { createStructuredLog, getActiveTraceId, kafkaTraceHeaders, logJson } from '@food-ordering/observability';

export class KafkaEventPublisher implements EventPublisher {
  private producer: Producer | null = null;

  constructor(
    private readonly brokers: string[],
    private readonly clientId: string,
  ) {}

  async connect(): Promise<void> {
    const kafka = new Kafka({
      clientId: this.clientId,
      brokers: this.brokers,
      logLevel: logLevel.ERROR,
    });
    this.producer = kafka.producer();
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer?.disconnect();
  }

  async publish(message: KafkaMessageEnvelope): Promise<void> {
    if (!this.producer) {
      logJson(
        createStructuredLog('order', 'warn', 'kafka producer not connected', null, {
          topic: message.topic,
        }),
      );
      return;
    }
    const withTrace: KafkaMessageEnvelope = {
      ...message,
      traceId: message.traceId ?? getActiveTraceId() ?? undefined,
    };
    const headers = kafkaTraceHeaders();
    await this.producer.send({
      topic: message.topic,
      messages: [
        {
          key: message.key,
          value: JSON.stringify(withTrace),
          headers,
        },
      ],
    });
  }
}

/** Article II.5 — poll outbox and publish to Kafka */
export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly orders: OrderRepository,
    private readonly publisher: EventPublisher,
    private readonly intervalMs = 500,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async tick(): Promise<number> {
    const batch = await this.orders.claimOutboxBatch(50);
    if (!batch.length) {
      return 0;
    }
    for (const row of batch) {
      await this.publisher.publish({
        eventId: row.id,
        topic: row.event,
        key: String((row.payload as { orderId?: string }).orderId ?? row.id),
        payload: row.payload,
        occurredAt: new Date().toISOString(),
      });
    }
    await this.orders.markOutboxPublished(batch.map((b) => b.id));
    return batch.length;
  }
}

/**  Documentation §5.2 — Order Finalizer consumes order.created */
export class OrderFinalizerWorker {
  private consumer: Consumer | null = null;

  constructor(
    private readonly brokers: string[],
    private readonly clientId: string,
    private readonly orderService: OrderService,
  ) {}

  async start(): Promise<void> {
    const kafka = new Kafka({
      clientId: `${this.clientId}-finalizer`,
      brokers: this.brokers,
      logLevel: logLevel.ERROR,
    });
    this.consumer = kafka.consumer({ groupId: 'order-finalizer' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: KafkaTopics.OrderCreated, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }
        try {
          const envelope = JSON.parse(message.value.toString()) as {
            payload?: { orderId?: string };
          };
          const orderId = envelope.payload?.orderId;
          if (orderId) {
            await this.orderService.finalizeOrder(orderId);
          }
        } catch (err) {
          logJson(
            createStructuredLog('order', 'error', 'finalizer failed', null, {
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

export class InMemoryEventPublisher implements EventPublisher {
  readonly published: KafkaMessageEnvelope[] = [];
  async publish(message: KafkaMessageEnvelope) {
    this.published.push(message);
  }
}
