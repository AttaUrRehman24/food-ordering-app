import Redis from 'ioredis';
import { getBusinessMetrics } from '@food-ordering/observability';
import type { CatalogCache } from '../../application/ports';
import type { ProductDto } from '../../domain/types';

/**  Documentation §7 — product:{id}, catalog:list:{page} */
export class RedisCatalogCache implements CatalogCache {
  constructor(private readonly redis: Redis) {}

  async getProduct(id: string): Promise<ProductDto | null> {
    const raw = await this.redis.get(`product:${id}`);
    if (raw) {
      getBusinessMetrics().cacheHits.inc();
      return JSON.parse(raw) as ProductDto;
    }
    getBusinessMetrics().cacheMisses.inc();
    return null;
  }

  async setProduct(product: ProductDto): Promise<void> {
    await this.redis.set(`product:${product.id}`, JSON.stringify(product), 'EX', 300);
  }

  async getList(
    page: number,
    limit: number,
  ): Promise<{ items: ProductDto[]; total: number } | null> {
    const raw = await this.redis.get(`catalog:list:${page}:${limit}`);
    if (raw) {
      getBusinessMetrics().cacheHits.inc();
      return JSON.parse(raw) as { items: ProductDto[]; total: number };
    }
    getBusinessMetrics().cacheMisses.inc();
    return null;
  }

  async setList(
    page: number,
    limit: number,
    data: { items: ProductDto[]; total: number },
  ): Promise<void> {
    await this.redis.set(`catalog:list:${page}:${limit}`, JSON.stringify(data), 'EX', 60);
  }

  async invalidateProduct(id: string): Promise<void> {
    await this.redis.del(`product:${id}`);
  }

  async invalidateLists(): Promise<void> {
    const keys = await this.redis.keys('catalog:list:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

/** In-memory cache for unit tests */
export class InMemoryCatalogCache implements CatalogCache {
  private products = new Map<string, ProductDto>();
  private lists = new Map<string, { items: ProductDto[]; total: number }>();

  async getProduct(id: string) {
    return this.products.get(id) ?? null;
  }
  async setProduct(product: ProductDto) {
    this.products.set(product.id, product);
  }
  async getList(page: number, limit: number) {
    return this.lists.get(`${page}:${limit}`) ?? null;
  }
  async setList(page: number, limit: number, data: { items: ProductDto[]; total: number }) {
    this.lists.set(`${page}:${limit}`, data);
  }
  async invalidateProduct(id: string) {
    this.products.delete(id);
  }
  async invalidateLists() {
    this.lists.clear();
  }
}
