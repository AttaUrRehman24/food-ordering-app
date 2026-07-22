import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** Order schema —  Documentation §6.1 / §6.2 monthly range partition on orders */
export class InitOrderSchema1740000003000 implements MigrationInterface {
  name = 'InitOrderSchema1740000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id UUID NOT NULL,
        total NUMERIC(12,2) NOT NULL,
        payment_type TEXT NOT NULL,
        status TEXT NOT NULL,
        soft_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (id, created_at),
        CONSTRAINT CHK_orders_status CHECK (status IN ('pending','paid','failed','cancelled')),
        CONSTRAINT CHK_orders_payment_type CHECK (payment_type IN ('COD','Card'))
      ) PARTITION BY RANGE (created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS orders_default PARTITION OF orders DEFAULT
    `);

    // Current + next month partitions (pg_partman automates further in ops — TDR-4)
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
      const name = `orders_${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
      const from = start.toISOString().slice(0, 10);
      const to = end.toISOString().slice(0, 10);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${name} PARTITION OF orders
        FOR VALUES FROM ('${from}') TO ('${to}')
      `);
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_orders_user_created ON orders (user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_orders_pending ON orders (status) WHERE status = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_orders_user_created_covering ON orders (user_id, created_at DESC) INCLUDE (total, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_orders_created_brin ON orders USING BRIN (created_at)`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'order_items',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'order_id', type: 'uuid', isNullable: false },
          { name: 'order_created_at', type: 'timestamptz', isNullable: false },
          { name: 'variant_id', type: 'uuid', isNullable: false },
          { name: 'product_name_snapshot', type: 'text', isNullable: false },
          { name: 'variant_label_snapshot', type: 'text', isNullable: false },
          { name: 'unit_price_snapshot', type: 'numeric', precision: 12, scale: 2, isNullable: false },
          { name: 'quantity', type: 'int', isNullable: false },
        ],
        foreignKeys: [
          {
            columnNames: ['order_id', 'order_created_at'],
            referencedTableName: 'orders',
            referencedColumnNames: ['id', 'created_at'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'order_status_history',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'order_id', type: 'uuid', isNullable: false },
          { name: 'order_created_at', type: 'timestamptz', isNullable: false },
          { name: 'status', type: 'text', isNullable: false },
          { name: 'at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
        foreignKeys: [
          {
            columnNames: ['order_id', 'order_created_at'],
            referencedTableName: 'orders',
            referencedColumnNames: ['id', 'created_at'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'order_outbox',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'event', type: 'text', isNullable: false },
          { name: 'payload', type: 'jsonb', isNullable: false },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'published_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'order_outbox',
      new TableIndex({
        name: 'IDX_order_outbox_unpublished',
        columnNames: ['created_at'],
        where: '"published_at" IS NULL',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'order_idempotency',
        columns: [
          { name: 'key', type: 'text', isPrimary: true },
          { name: 'order_id', type: 'uuid', isNullable: false },
          { name: 'response_body', type: 'jsonb', isNullable: false },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('order_idempotency', true);
    await queryRunner.dropTable('order_outbox', true);
    await queryRunner.dropTable('order_status_history', true);
    await queryRunner.dropTable('order_items', true);
    await queryRunner.query(`DROP TABLE IF EXISTS orders CASCADE`);
  }
}
