export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';

export type NotificationType =
  | 'otp'
  | 'welcome'
  | 'order_created'
  | 'order_paid'
  | 'order_failed'
  | 'order_status';

export interface NotificationJob {
  userId: string;
  channel: NotificationChannel;
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  /** Security/OTP bypass preference opt-outs (§9) */
  force?: boolean;
  priority: 0 | 1 | 2;
}

export interface ChannelProvider {
  readonly channel: NotificationChannel;
  send(job: NotificationJob): Promise<void>;
}
