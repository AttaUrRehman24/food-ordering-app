import { MigrationInterface, QueryRunner, Table, TableUnique } from 'typeorm';

/**
 * Notification schema —  Documentation §3.2 / §6.1 / §9
 * `notifications` range-partitioned by month (created_at); BRIN on created_at.
 */
export class InitNotificationSchema1740000004000 implements MigrationInterface {
  name = 'InitNotificationSchema1740000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id UUID NOT NULL,
        channel TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}',
        read_at TIMESTAMPTZ NULL,
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications_default PARTITION OF notifications DEFAULT
    `);

    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
      const partName = `notifications_${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
      const from = start.toISOString().slice(0, 10);
      const to = end.toISOString().slice(0, 10);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${partName} PARTITION OF notifications
        FOR VALUES FROM ('${from}') TO ('${to}')
      `);
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_notifications_user_id ON notifications (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_notifications_created_brin ON notifications USING BRIN (created_at)`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'notification_delivery',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'notification_id', type: 'uuid', isNullable: false },
          { name: 'notification_created_at', type: 'timestamptz', isNullable: false },
          { name: 'channel', type: 'text', isNullable: false },
          { name: 'status', type: 'text', isNullable: false },
          { name: 'attempts', type: 'int', default: 0, isNullable: false },
          { name: 'error', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'delivered_at', type: 'timestamptz', isNullable: true },
        ],
        foreignKeys: [
          {
            columnNames: ['notification_id', 'notification_created_at'],
            referencedTableName: 'notifications',
            referencedColumnNames: ['id', 'created_at'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'notification_preferences',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'channel', type: 'text', isNullable: false },
          { name: 'enabled', type: 'boolean', default: true, isNullable: false },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_notification_preferences_user_channel',
            columnNames: ['user_id', 'channel'],
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notification_preferences', true);
    await queryRunner.dropTable('notification_delivery', true);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications CASCADE`);
  }
}
