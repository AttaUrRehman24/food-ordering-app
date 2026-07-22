import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { OrderStatus } from '@food-ordering/domain';
import { Order } from './order.entity';

/**  Documentation §6.1 ORDER_STATUS_HISTORY */
@Entity()
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'timestamptz' })
  orderCreatedAt!: Date;

  @Column({ type: 'text' })
  status!: OrderStatus;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  at!: Date;

  @ManyToOne(() => Order, (order) => order.statusHistory, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'order_id', referencedColumnName: 'id' },
    { name: 'order_created_at', referencedColumnName: 'createdAt' },
  ])
  order!: Order;
}
