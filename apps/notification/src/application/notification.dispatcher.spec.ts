import { mapTopicToJobs } from '../infrastructure/messaging/kafka.worker';
import { KafkaTopics } from '@food-ordering/kafka';
import { NotificationDispatcher } from './notification.dispatcher';
import type { ChannelProvider, NotificationJob } from '../domain/types';

describe('mapTopicToJobs ( Documentation §9)', () => {
  it('maps OTP as P0 force-send on email only', () => {
    const jobs = mapTopicToJobs(KafkaTopics.UserOtpRequested, {
      userId: 'u1',
      otpCode: '123456',
      type: 'phone',
      email: 'u1@example.com',
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].channel).toBe('email');
    expect(jobs[0].payload.email).toBe('u1@example.com');
    expect(jobs[0].force).toBe(true);
    expect(jobs[0].priority).toBe(0);
  });

  it('maps order.paid to email + push + in_app', () => {
    const jobs = mapTopicToJobs(KafkaTopics.OrderPaid, {
      userId: 'u1',
      orderId: 'o1',
      total: '12.50',
    });
    expect(jobs.map((j) => j.channel).sort()).toEqual(['email', 'in_app', 'push']);
  });

  it('maps order.status.changed to push', () => {
    const jobs = mapTopicToJobs(KafkaTopics.OrderStatusChanged, {
      userId: 'u1',
      orderId: 'o1',
      status: 'paid',
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].channel).toBe('push');
    expect(jobs[0].type).toBe('order_status');
  });
});

describe('NotificationDispatcher', () => {
  it('skips when preference disabled unless force', async () => {
    const sent: NotificationJob[] = [];
    const provider: ChannelProvider = {
      channel: 'email',
      send: async (job) => {
        sent.push(job);
      },
    };

    const prefs = new Map<string, boolean>([['u1:email', false]]);
    const fakeDs = {
      getRepository: (entity: { name: string }) => {
        if (entity.name === 'NotificationPreference') {
          return {
            findOneBy: async ({ userId, channel }: { userId: string; channel: string }) => {
              const enabled = prefs.get(`${userId}:${channel}`);
              return enabled === undefined ? null : { enabled };
            },
          };
        }
        if (entity.name === 'Notification') {
          return {
            create: (v: unknown) => v,
            save: async (v: Record<string, unknown>) => ({
              ...v,
              id: 'n1',
              createdAt: new Date('2026-01-01'),
            }),
          };
        }
        return {
          create: (v: unknown) => v,
          save: async (v: unknown) => v,
        };
      },
    };

    const dispatcher = new NotificationDispatcher(
      fakeDs as never,
      [provider],
      async () => undefined,
    );

    await dispatcher.dispatch({
      userId: 'u1',
      channel: 'email',
      type: 'welcome',
      title: 'Hi',
      body: 'Hi',
      payload: {},
      priority: 1,
    });
    expect(sent).toHaveLength(0);

    await dispatcher.dispatch({
      userId: 'u1',
      channel: 'email',
      type: 'otp',
      title: 'OTP',
      body: '123',
      payload: {},
      force: true,
      priority: 0,
    });
    expect(sent).toHaveLength(1);
  });
});
