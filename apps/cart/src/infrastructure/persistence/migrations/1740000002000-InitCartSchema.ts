import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/** Cart cold snapshot —  Documentation §6.1 CARTS / TDR-5 */
export class InitCartSchema1740000002000 implements MigrationInterface {
  name = 'InitCartSchema1740000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'carts',
        columns: [
          { name: 'user_id', type: 'uuid', isPrimary: true },
          {
            name: 'items',
            type: 'jsonb',
            default: "'[]'",
            isNullable: false,
          },
          {
            name: 'total',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_carts_items_gin ON carts USING GIN (items jsonb_path_ops)`,
    );
    await queryRunner.createIndex(
      'carts',
      new TableIndex({ name: 'IDX_carts_updated_at', columnNames: ['updated_at'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('carts', true);
  }
}
