import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';
import { KafkaTopics } from '@food-ordering/kafka';
import type { NotificationDispatcher } from '../../application/notification.dispatcher';
import type { NotificationJob } from '../../domain/types';
import { createStructuredLog, getActiveTraceId, getBusinessMetrics, kafkaTraceHeaders, logJson } from '@food-ordering/observability';

type Envelope = {
  payload: Record<string, unknown>;
};

/**
 *  Documentation §3.2 / §5.1 / §9 — consume notification events; OTP is P0.
 * Also consumes order.status.changed for push (§5.1 drives WS + push).
 */
export class NotificationKafkaWorker {
  private consumer: Consumer | null = null;
  private dlqProducer: Producer | null = null;

  constructor(
    private readonly brokers: string[],
    private readonly clientId: string,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async start(): Promise<void> {
    const kafka = new Kafka({
      clientId: this.clientId,
      brokers: this.brokers,
      logLevel: logLevel.ERROR,
    });
    this.dlqProducer = kafka.producer();
    await this.dlqProducer.connect();

    this.consumer = kafka.consumer({ groupId: 'notification-workers' });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [
        KafkaTopics.UserOtpRequested,
        KafkaTopics.UserRegistered,
        KafkaTopics.OrderCreated,
        KafkaTopics.OrderPaid,
        KafkaTopics.OrderFailed,
        KafkaTopics.OrderStatusChanged,
      ],
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) {
          return;
        }
        try {
          const envelope = JSON.parse(message.value.toString()) as Envelope;
          const jobs = mapTopicToJobs(topic, envelope.payload ?? {});
          jobs.sort((a, b) => a.priority - b.priority);
          for (const job of jobs) {
            await this.dispatcher.dispatch(job);
          }
        } catch (err) {
          logJson(
            createStructuredLog('notification', 'error', 'consumer failed', null, {
              topic,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      },
    });
  }

  async publishDlq(job: NotificationJob, error: string): Promise<void> {
    if (!this.dlqProducer) {
      return;
    }
    await this.dlqProducer.send({
      topic: `notification.${job.channel}.DLQ`,
      messages: [
        {
          key: job.userId,
          value: JSON.stringify({ job, error, at: new Date().toISOString() }),
          headers: kafkaTraceHeaders(),
        },
      ],
    });
    getBusinessMetrics().dlqMessages.inc({ channel: job.channel });
    logJson(
      createStructuredLog('notification', 'error', 'message sent to DLQ', null, {
        type: job.type,
        channel: job.channel,
        error,
        trace_id: getActiveTraceId(),
      }),
    );
  }

  async stop(): Promise<void> {
    await this.consumer?.disconnect();
    await this.dlqProducer?.disconnect();
  }
}

export function mapTopicToJobs(
  topic: string,
  payload: Record<string, unknown>,
): NotificationJob[] {
  const userId = String(payload.userId ?? '');
  if (!userId) {
    return [];
  }

  switch (topic) {
    case KafkaTopics.UserOtpRequested: {
      const otp = String(payload.otpCode ?? '');
      // OTP is email-only (local/prod policy) — ignore phone type for delivery channel
      return [
        {
          userId,
          channel: 'email',
          type: 'otp',
          title: 'Your login code',
          body: `Your login code is ${otp}. Expires in 5 minutes.`,
          payload: {
            otpCode: otp,
            email: payload.email,
          },
          force: true,
          priority: 0,
        },
      ];
    }
    case KafkaTopics.UserRegistered:
      return [
        {
          userId,
          channel: 'email',
          type: 'welcome',
          title: 'Welcome to FoodApp!',
          body: `Welcome ${String(payload.name ?? '')}!`,
          payload: { email: payload.email },
          priority: 1,
        },
        {
          userId,
          channel: 'in_app',
          type: 'welcome',
          title: 'Welcome to FoodApp!',
          body: 'Welcome to FoodApp!',
          payload: {},
          priority: 1,
        },
      ];
    case KafkaTopics.OrderCreated:
      return [
        {
          userId,
          channel: 'in_app',
          type: 'order_created',
          title: 'Order placed',
          body: `Order ${String(payload.orderId ?? '')} is pending`,
          payload,
          priority: 1,
        },
      ];
    case KafkaTopics.OrderPaid:
      return [
        {
          userId,
          channel: 'email',
          type: 'order_paid',
          title: 'Order confirmed',
          body: `Order ${String(payload.orderId ?? '')} confirmed - $${String(payload.total ?? '')}`,
          payload,
          priority: 0,
        },
        {
          userId,
          channel: 'push',
          type: 'order_paid',
          title: 'Order confirmed',
          body: `Order ${String(payload.orderId ?? '')} confirmed`,
          payload,
          priority: 0,
        },
        {
          userId,
          channel: 'in_app',
          type: 'order_paid',
          title: 'Order confirmed',
          body: `Order ${String(payload.orderId ?? '')} confirmed - $${String(payload.total ?? '')}`,
          payload,
          priority: 0,
        },
      ];
    case KafkaTopics.OrderFailed:
      return [
        {
          userId,
          channel: 'email',
          type: 'order_failed',
          title: 'Order failed',
          body: `Order ${String(payload.orderId ?? '')} failed`,
          payload,
          priority: 0,
        },
        {
          userId,
          channel: 'in_app',
          type: 'order_failed',
          title: 'Order failed',
          body: `Order ${String(payload.orderId ?? '')} failed`,
          payload,
          priority: 0,
        },
      ];
    case KafkaTopics.OrderStatusChanged:
      return [
        {
          userId,
          channel: 'push',
          type: 'order_status',
          title: 'Order update',
          body: `Order ${String(payload.orderId ?? '')} is now ${String(payload.status ?? '')}`,
          payload,
          priority: 0,
        },
      ];
    default:
      return [];
  }
}
