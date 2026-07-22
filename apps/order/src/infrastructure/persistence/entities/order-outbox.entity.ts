import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**  Documentation §3.2 / Article II.5 — transactional outbox */
@Entity()
export class OrderOutbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  event!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
