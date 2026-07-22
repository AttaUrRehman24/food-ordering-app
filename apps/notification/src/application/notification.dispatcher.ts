import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { ChannelProvider, NotificationJob } from '../domain/types';
import {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from '../infrastructure/persistence/entities/notification.entity';
import { createStructuredLog, logJson } from '@food-ordering/observability';

const MAX_ATTEMPTS = 3;

/**
 *  Documentation §9 — route by type+priority, honor preferences (except OTP/security),
 * retry with backoff → DLQ, delivery tracking.
 */
export class NotificationDispatcher {
  constructor(
    private readonly dataSource: DataSource,
    private readonly providers: ChannelProvider[],
    private readonly publishDlq: (job: NotificationJob, error: string) => Promise<void>,
  ) {}

  async dispatch(job: NotificationJob): Promise<void> {
    if (!job.force) {
      const allowed = await this.isChannelEnabled(job.userId, job.channel);
      if (!allowed) {
        logJson(
          createStructuredLog('notification', 'info', 'skipped by preference', null, {
            userId: job.userId,
            channel: job.channel,
            type: job.type,
          }),
        );
        return;
      }
    }

    const repo = this.dataSource.getRepository(Notification);
    const deliveryRepo = this.dataSource.getRepository(NotificationDelivery);
    const createdAt = new Date();
    const id = randomUUID();

    const notification = await repo.save(
      repo.create({
        id,
        createdAt,
        userId: job.userId,
        channel: job.channel,
        type: job.type,
        title: job.title,
        body: job.body,
        payload: job.payload,
        readAt: null,
      }),
    );

    const provider = this.providers.find((p) => p.channel === job.channel);
    if (!provider) {
      await deliveryRepo.save(
        deliveryRepo.create({
          notificationId: notification.id,
          notificationCreatedAt: notification.createdAt,
          channel: job.channel,
          status: 'failed',
          attempts: 1,
          error: `No provider for channel ${job.channel}`,
        }),
      );
      return;
    }

    let lastError = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await provider.send(job);
        await deliveryRepo.save(
          deliveryRepo.create({
            notificationId: notification.id,
            notificationCreatedAt: notification.createdAt,
            channel: job.channel,
            status: 'sent',
            attempts: attempt,
            error: null,
            deliveredAt: new Date(),
          }),
        );
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await deliveryRepo.save(
          deliveryRepo.create({
            notificationId: notification.id,
            notificationCreatedAt: notification.createdAt,
            channel: job.channel,
            status: attempt >= MAX_ATTEMPTS ? 'dlq' : 'failed',
            attempts: attempt,
            error: lastError,
          }),
        );
        if (attempt < MAX_ATTEMPTS) {
          await sleep(2 ** attempt * 100);
        }
      }
    }

    await this.publishDlq(job, lastError);
  }

  private async isChannelEnabled(userId: string, channel: string): Promise<boolean> {
    const pref = await this.dataSource.getRepository(NotificationPreference).findOneBy({
      userId,
      channel,
    });
    return pref ? pref.enabled : true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
