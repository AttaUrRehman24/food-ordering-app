import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppNamingStrategy } from '@food-ordering/persistence';
import { notificationEntities } from './entities';
import { InitNotificationSchema1740000004000 } from './migrations/1740000004000-InitNotificationSchema';

export function buildNotificationDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  return {
    type: 'postgres',
    url,
    entities: notificationEntities,
    migrations: [InitNotificationSchema1740000004000],
    migrationsTableName: 'typeorm_migrations_notification',
    namingStrategy: new AppNamingStrategy(),
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}

export async function runNotificationTypeOrmMigrations(ds: DataSource): Promise<void> {
  await ds.runMigrations({ transaction: 'each' });
}

export default new DataSource(
  process.env.DATABASE_URL
    ? buildNotificationDataSourceOptions()
    : {
        type: 'postgres',
        url: 'postgres://food:food@localhost:5432/food_ordering',
        entities: notificationEntities,
        migrations: [InitNotificationSchema1740000004000],
        migrationsTableName: 'typeorm_migrations_notification',
        namingStrategy: new AppNamingStrategy(),
        synchronize: false,
      },
);
