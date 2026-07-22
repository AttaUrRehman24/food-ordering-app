import { Kafka, type Producer, logLevel } from 'kafkajs';
import type { KafkaMessageEnvelope } from '@food-ordering/kafka';
import type { EventPublisher } from '../../application/ports';
import { createStructuredLog, logJson } from '@food-ordering/observability';

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
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  async publish(message: KafkaMessageEnvelope): Promise<void> {
    if (!this.producer) {
      logJson(
        createStructuredLog('catalog', 'warn', 'kafka producer not connected; event dropped', null, {
          topic: message.topic,
        }),
      );
      return;
    }
    await this.producer.send({
      topic: message.topic,
      messages: [
        {
          key: message.key,
          value: JSON.stringify(message),
          headers: message.traceId ? { trace_id: message.traceId } : undefined,
        },
      ],
    });
  }
}

export class InMemoryEventPublisher implements EventPublisher {
  readonly published: KafkaMessageEnvelope[] = [];
  async publish(message: KafkaMessageEnvelope): Promise<void> {
    this.published.push(message);
  }
}
