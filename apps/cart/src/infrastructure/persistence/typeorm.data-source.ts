import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppNamingStrategy } from '@food-ordering/persistence';
import { cartEntities } from './entities';
import { InitCartSchema1740000002000 } from './migrations/1740000002000-InitCartSchema';

export function buildCartDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    type: 'postgres',
    url,
    entities: cartEntities,
    migrations: [InitCartSchema1740000002000],
    migrationsTableName: 'typeorm_migrations_cart',
    namingStrategy: new AppNamingStrategy(),
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}

export async function runCartTypeOrmMigrations(ds: DataSource): Promise<void> {
  await ds.runMigrations({ transaction: 'each' });
}

export default new DataSource(
  process.env.DATABASE_URL
    ? buildCartDataSourceOptions()
    : {
        type: 'postgres',
        url: 'postgres://food:food@localhost:5432/food_ordering',
        entities: cartEntities,
        migrations: [InitCartSchema1740000002000],
        migrationsTableName: 'typeorm_migrations_cart',
        namingStrategy: new AppNamingStrategy(),
        synchronize: false,
      },
);
