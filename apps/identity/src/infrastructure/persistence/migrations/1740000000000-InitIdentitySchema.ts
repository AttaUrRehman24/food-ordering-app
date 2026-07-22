import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

/**
 * Identity schema — TypeORM Table API ( Documentation §3.2 / §6.1 / §8).
 * Entities use @Entity() + BaseEntity; this migration creates matching tables.
 */
export class InitIdentitySchema1740000000000 implements MigrationInterface {
  name = 'InitIdentitySchema1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'name', type: 'text', isNullable: false },
        ],
        uniques: [new TableUnique({ name: 'UQ_roles_name', columnNames: ['name'] })],
        checks: [{ name: 'CHK_roles_name', expression: `"name" IN ('customer', 'admin')` }],
      }),
      true,
    );

    await queryRunner.query(
      `INSERT INTO roles (name) VALUES ('customer'), ('admin') ON CONFLICT (name) DO NOTHING`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'name', type: 'text', isNullable: false },
          { name: 'email', type: 'citext', isNullable: false, isUnique: true },
          { name: 'phone', type: 'text', isNullable: false, isUnique: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({ name: 'IDX_users_email', columnNames: ['email'] }),
    );
    await queryRunner.createIndex(
      'users',
      new TableIndex({ name: 'IDX_users_phone', columnNames: ['phone'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'credentials',
        columns: [
          { name: 'user_id', type: 'uuid', isPrimary: true },
          { name: 'password_hash', type: 'text', isNullable: false },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'credentials',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'role_id', type: 'int', isNullable: false },
        ],
      }),
      true,
    );
    await queryRunner.createPrimaryKey('user_roles', ['user_id', 'role_id']);
    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        columnNames: ['role_id'],
        referencedTableName: 'roles',
        referencedColumnNames: ['id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'device_ua', type: 'text', isNullable: true },
          { name: 'ip', type: 'text', isNullable: true },
          { name: 'access_jti', type: 'text', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'last_active',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'sessions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'sessions',
      new TableIndex({ name: 'IDX_sessions_user_id', columnNames: ['user_id'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'session_id', type: 'uuid', isNullable: false },
          { name: 'token_hash', type: 'text', isNullable: false, isUnique: true },
          { name: 'family_id', type: 'uuid', isNullable: false },
          { name: 'expires_at', type: 'timestamptz', isNullable: false },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'refresh_tokens',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'refresh_tokens',
      new TableForeignKey({
        columnNames: ['session_id'],
        referencedTableName: 'sessions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({ name: 'IDX_refresh_tokens_family_id', columnNames: ['family_id'] }),
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({ name: 'IDX_refresh_tokens_session_id', columnNames: ['session_id'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'audit_log',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'action', type: 'text', isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: true },
          { name: 'target_session_id', type: 'uuid', isNullable: true },
          { name: 'ip', type: 'text', isNullable: true },
          { name: 'ua', type: 'text', isNullable: true },
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'",
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'audit_log',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await queryRunner.createIndex(
      'audit_log',
      new TableIndex({ name: 'IDX_audit_log_user_id', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'audit_log',
      new TableIndex({ name: 'IDX_audit_log_created_at', columnNames: ['created_at'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_log', true);
    await queryRunner.dropTable('refresh_tokens', true);
    await queryRunner.dropTable('sessions', true);
    await queryRunner.dropTable('user_roles', true);
    await queryRunner.dropTable('credentials', true);
    await queryRunner.dropTable('users', true);
    await queryRunner.dropTable('roles', true);
  }
}
