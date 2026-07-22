import { CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Standard TypeORM base entity for all services.
 *  Documentation UUID PKs + created_at (timestamptz).
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
