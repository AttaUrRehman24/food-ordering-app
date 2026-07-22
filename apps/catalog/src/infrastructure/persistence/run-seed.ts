import dataSource, { runCatalogTypeOrmMigrations } from './typeorm.data-source';
import { seedCatalogProducts } from './seed-products';

async function main(): Promise<void> {
  const ds = await dataSource.initialize();
  try {
    await runCatalogTypeOrmMigrations(ds);
    await seedCatalogProducts(ds);
  } finally {
    await ds.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
