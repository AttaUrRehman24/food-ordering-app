import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@food-ordering/persistence';
import { Product } from './product.entity';

/**  Documentation §6.1 VARIANTS */
@Entity()
export class Variant extends BaseEntity {
  @Column({ type: 'uuid' })
  productId!: string;

  @Column()
  label!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price!: string;

  @Column({ default: true })
  isActive!: boolean;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;
}
