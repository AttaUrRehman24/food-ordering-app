import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@food-ordering/persistence';
import { User } from './user.entity';
import { Session } from './session.entity';

/**  Documentation §8 refresh_tokens */
@Entity()
export class RefreshToken extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @Column({ unique: true })
  tokenHash!: string;

  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Session, (session) => session.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: Session;
}
