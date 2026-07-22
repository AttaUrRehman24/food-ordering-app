import { Kafka, type Producer, logLevel } from 'kafkajs';
import type { KafkaMessageEnvelope } from '@food-ordering/kafka';
import type { EventPublisher } from '../../application/ports';
import {
  createStructuredLog,
  getActiveTraceId,
  kafkaTraceHeaders,
  logJson,
} from '@food-ordering/observability';

export class KafkaEventPublisher implements EventPublisher {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly enabled: boolean;

  constructor(brokers: string[], clientId: string) {
    this.enabled = brokers.length > 0 && brokers[0] !== '';
    this.kafka = new Kafka({
      clientId,
      brokers: brokers.length ? brokers : ['localhost:9092'],
      logLevel: logLevel.ERROR,
    });
  }

  async connect(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    this.producer = this.kafka.producer();
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  async publish(message: KafkaMessageEnvelope): Promise<void> {
    if (!this.producer) {
      logJson(
        createStructuredLog('identity', 'warn', 'kafka producer not connected; event dropped', null, {
          topic: message.topic,
        }),
      );
      return;
    }
    const withTrace = {
      ...message,
      traceId: message.traceId ?? getActiveTraceId() ?? undefined,
    };
    await this.producer.send({
      topic: message.topic,
      messages: [
        {
          key: message.key,
          value: JSON.stringify(withTrace),
          headers: kafkaTraceHeaders(),
        },
      ],
    });
  }
}

/** No-op publisher for unit tests / offline boot */
export class InMemoryEventPublisher implements EventPublisher {
  readonly published: KafkaMessageEnvelope[] = [];

  async publish(message: KafkaMessageEnvelope): Promise<void> {
    this.published.push(message);
  }
}
