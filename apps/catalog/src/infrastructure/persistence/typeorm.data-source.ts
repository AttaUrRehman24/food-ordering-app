import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppNamingStrategy } from '@food-ordering/persistence';
import { catalogEntities } from './entities';
import { InitCatalogSchema1740000001000 } from './migrations/1740000001000-InitCatalogSchema';

export function buildCatalogDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    type: 'postgres',
    url,
    entities: catalogEntities,
    migrations: [InitCatalogSchema1740000001000],
    migrationsTableName: 'typeorm_migrations_catalog',
    namingStrategy: new AppNamingStrategy(),
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}

export async function runCatalogTypeOrmMigrations(ds: DataSource): Promise<void> {
  await ds.runMigrations({ transaction: 'each' });
}

export default new DataSource(
  process.env.DATABASE_URL
    ? buildCatalogDataSourceOptions()
    : {
        type: 'postgres',
        url: 'postgres://food:food@localhost:5432/food_ordering',
        entities: catalogEntities,
        migrations: [InitCatalogSchema1740000001000],
        migrationsTableName: 'typeorm_migrations_catalog',
        namingStrategy: new AppNamingStrategy(),
        synchronize: false,
      },
);
