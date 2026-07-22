import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '@food-ordering/persistence';
import { User } from './user.entity';
import { RefreshToken } from './refresh-token.entity';

/**  Documentation §8 sessions */
@Entity()
export class Session extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'text', nullable: true })
  deviceUa!: string | null;

  @Column({ type: 'text', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  accessJti!: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  lastActive!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @OneToMany(() => RefreshToken, (token) => token.session)
  refreshTokens?: RefreshToken[];
}
