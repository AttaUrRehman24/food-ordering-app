import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/** Catalog schema —  Documentation §6.1 products / variants + image_url (§13) */
export class InitCatalogSchema1740000001000 implements MigrationInterface {
  name = 'InitCatalogSchema1740000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    await queryRunner.createTable(
      new Table({
        name: 'products',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'name', type: 'text', isNullable: false },
          { name: 'description', type: 'text', default: "''", isNullable: false },
          { name: 'is_active', type: 'boolean', default: true, isNullable: false },
          { name: 'image_url', type: 'text', isNullable: true },
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

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_products_name_trgm ON products USING GIN (name gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_products_description_trgm ON products USING GIN (description gin_trgm_ops)`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'variants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'product_id', type: 'uuid', isNullable: false },
          { name: 'label', type: 'text', isNullable: false },
          { name: 'price', type: 'numeric', precision: 12, scale: 2, isNullable: false },
          { name: 'is_active', type: 'boolean', default: true, isNullable: false },
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
      'variants',
      new TableForeignKey({
        columnNames: ['product_id'],
        referencedTableName: 'products',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'variants',
      new TableIndex({
        name: 'IDX_variants_product_id_active',
        columnNames: ['product_id'],
        where: '"is_active" = true',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('variants', true);
    await queryRunner.dropTable('products', true);
  }
}
