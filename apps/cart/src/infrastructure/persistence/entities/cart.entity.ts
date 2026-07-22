import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 *  Documentation §6.1 CARTS — Postgres cold snapshot (TDR-5 / Q4).
 * Primary cart store is Redis; this table is recovery/analytics snapshot.
 * PK is user_id (not UUID BaseEntity id) per ER diagram.
 */
@Entity()
export class Cart {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items!: Array<{
    productId: string;
    variantId: string;
    label: string;
    unitPrice: string;
    quantity: number;
  }>;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total!: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
