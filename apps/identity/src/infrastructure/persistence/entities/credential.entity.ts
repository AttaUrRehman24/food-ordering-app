import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/**  Documentation §6.1 CREDENTIALS */
@Entity()
export class Credential {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column()
  passwordHash!: string;

  @OneToOne(() => User, (user) => user.credential, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
