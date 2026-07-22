import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppNamingStrategy } from '@food-ordering/persistence';
import { orderEntities } from './entities';
import { InitOrderSchema1740000003000 } from './migrations/1740000003000-InitOrderSchema';

export function buildOrderDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    type: 'postgres',
    url,
    entities: orderEntities,
    migrations: [InitOrderSchema1740000003000],
    migrationsTableName: 'typeorm_migrations_order',
    namingStrategy: new AppNamingStrategy(),
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}

export async function runOrderTypeOrmMigrations(ds: DataSource): Promise<void> {
  await ds.runMigrations({ transaction: 'each' });
}

export default new DataSource(
  process.env.DATABASE_URL
    ? buildOrderDataSourceOptions()
    : {
        type: 'postgres',
        url: 'postgres://food:food@localhost:5432/food_ordering',
        entities: orderEntities,
        migrations: [InitOrderSchema1740000003000],
        migrationsTableName: 'typeorm_migrations_order',
        namingStrategy: new AppNamingStrategy(),
        synchronize: false,
      },
);
