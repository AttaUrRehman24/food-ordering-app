import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**  Documentation §3.2 — order_idempotency (Idempotency-Key) */
@Entity()
export class OrderIdempotency {
  @PrimaryColumn()
  key!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'jsonb' })
  responseBody!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
