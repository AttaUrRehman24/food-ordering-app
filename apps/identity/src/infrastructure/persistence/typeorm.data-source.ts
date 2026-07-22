import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppNamingStrategy } from '@food-ordering/persistence';
import { identityEntities } from './entities';
import { InitIdentitySchema1740000000000 } from './migrations/1740000000000-InitIdentitySchema';

/**
 * TypeORM DataSource for Identity.
 * Entities use @Entity() + BaseEntity; AppNamingStrategy maps to  Documentation table/column names.
 */
export function buildIdentityDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    type: 'postgres',
    url,
    entities: identityEntities,
    migrations: [InitIdentitySchema1740000000000],
    migrationsTableName: 'typeorm_migrations',
    namingStrategy: new AppNamingStrategy(),
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}

export async function createIdentityDataSource(): Promise<DataSource> {
  const ds = new DataSource(buildIdentityDataSourceOptions());
  await ds.initialize();
  return ds;
}

export async function runIdentityTypeOrmMigrations(ds: DataSource): Promise<void> {
  await ds.runMigrations({ transaction: 'each' });
}

/** CLI entry: `npm run identity:migration:run` */
export default new DataSource(
  process.env.DATABASE_URL
    ? buildIdentityDataSourceOptions()
    : {
        type: 'postgres',
        url: 'postgres://food:food@localhost:5432/food_ordering',
        entities: identityEntities,
        migrations: [InitIdentitySchema1740000000000],
        migrationsTableName: 'typeorm_migrations',
        namingStrategy: new AppNamingStrategy(),
        synchronize: false,
      },
);
