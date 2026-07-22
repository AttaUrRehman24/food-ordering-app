import { Column, Entity, JoinTable, ManyToMany, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '@food-ordering/persistence';
import { Credential } from './credential.entity';
import { Role } from './role.entity';
import { Session } from './session.entity';
import { RefreshToken } from './refresh-token.entity';
import { AuditLog } from './audit-log.entity';

/**  Documentation §6.1 — password is on Credential, not User (Article II.3) */
@Entity()
export class User extends BaseEntity {
  @Column()
  name!: string;

  @Column({ type: 'citext', unique: true })
  email!: string;

  @Column({ unique: true })
  phone!: string;

  @OneToOne(() => Credential, (credential) => credential.user, { cascade: true })
  credential?: Credential;

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @OneToMany(() => Session, (session) => session.user)
  sessions?: Session[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens?: RefreshToken[];

  @OneToMany(() => AuditLog, (log) => log.user)
  auditLogs?: AuditLog[];
}
