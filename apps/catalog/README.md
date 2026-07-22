# Catalog (`apps/catalog`)

Products, variants, Redis cache, MinIO media seam, food-menu seeder (PKR).

| | |
|---|---|
| HTTP health | `:3003` |
| gRPC | `:50052` |
| Proto | `libs/proto/protos/catalog.proto` |

## Docs

- [Setup / CATALOG_SEED_*](../../docs/SETUP.md)
- [Gateway catalog routes](../gateway/README.md)
- [Root README](../../README.md)

## Seed

```bash
export CATALOG_SEED_RESET=true CATALOG_SEED_PRODUCT_COUNT=36
npm run catalog:seed
```

Replaces old data with real food names, Unsplash images, and PKR prices. See `src/infrastructure/persistence/seed-products.ts`.

## Run

```bash
npm run catalog:migration:run
npm run serve:catalog
```
