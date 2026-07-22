import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/**
 *  Documentation §6.1 / §3.2 — notifications range-partitioned by created_at (month).
 * Composite PK (id, created_at) required for Postgres PARTITION BY RANGE.
 */
@Entity()
export class Notification {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @PrimaryColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column()
  channel!: string; // email | sms | push | in_app

  @Column()
  type!: string; // otp | welcome | order_created | order_paid | order_failed | order_status

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @OneToMany(() => NotificationDelivery, (d) => d.notification, { cascade: true })
  deliveries?: NotificationDelivery[];
}

/**  Documentation §9 — delivery tracking */
@Entity()
export class NotificationDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  notificationId!: string;

  @Column({ type: 'timestamptz' })
  notificationCreatedAt!: Date;

  @Column()
  channel!: string;

  @Column()
  status!: string; // sent | delivered | failed | dlq

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @ManyToOne(() => Notification, (n) => n.deliveries, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'notification_id', referencedColumnName: 'id' },
    { name: 'notification_created_at', referencedColumnName: 'createdAt' },
  ])
  notification!: Notification;
}

/**  Documentation §9 — per-user channel preferences (OTP/security always allowed) */
@Entity()
@Unique(['userId', 'channel'])
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column()
  channel!: string;

  @Column({ default: true })
  enabled!: boolean;
}
