import {
  Column,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { OrderStatus, PaymentType } from '@food-ordering/domain';
import { OrderItem } from './order-item.entity';
import { OrderStatusHistory } from './order-status-history.entity';

/**
 *  Documentation §6.1 ORDERS — composite PK (id, created_at) for monthly range partitioning.
 * Soft-delete per Q3 (admin cancel).
 */
@Entity()
export class Order {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @PrimaryColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total!: string;

  @Column({ type: 'text' })
  paymentType!: PaymentType;

  @Column({ type: 'text' })
  status!: OrderStatus;

  @Column({ default: false })
  softDeleted!: boolean;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items!: OrderItem[];

  @OneToMany(() => OrderStatusHistory, (h) => h.order, { cascade: true, eager: true })
  statusHistory!: OrderStatusHistory[];
}
