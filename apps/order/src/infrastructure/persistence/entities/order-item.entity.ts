import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from './order.entity';

/**  Documentation §6.1 ORDER_ITEMS — immutable price/name snapshots (Article II.2) */
@Entity()
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'timestamptz' })
  orderCreatedAt!: Date;

  @Column({ type: 'uuid' })
  variantId!: string;

  @Column()
  productNameSnapshot!: string;

  @Column()
  variantLabelSnapshot!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  unitPriceSnapshot!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'order_id', referencedColumnName: 'id' },
    { name: 'order_created_at', referencedColumnName: 'createdAt' },
  ])
  order!: Order;
}
