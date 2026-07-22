import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '@food-ordering/persistence';
import { Variant } from './variant.entity';

/**  Documentation §6.1 PRODUCTS (+ §13 image_url via media seam) */
@Entity()
export class Product extends BaseEntity {
  @Column()
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  imageUrl!: string | null;

  @OneToMany(() => Variant, (variant) => variant.product, { cascade: true, eager: true })
  variants!: Variant[];
}
