import { Role } from '@food-ordering/domain';
import { CatalogService } from './catalog.service';
import type {
  CatalogCache,
  EventPublisher,
  MediaStore,
  ProductRepository,
} from './ports';
import type {
  CreateProductInput,
  ProductDto,
  UpdateProductInput,
  VariantDto,
} from '../domain/types';
import type { KafkaMessageEnvelope } from '@food-ordering/kafka';

class MemRepo implements ProductRepository {
  private products = new Map<string, ProductDto>();
  private seq = 1;

  async list(page: number, limit: number) {
    const items = [...this.products.values()].filter((p) => p.isActive);
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), total: items.length };
  }
  async findById(id: string) {
    return this.products.get(id) ?? null;
  }
  async create(input: CreateProductInput) {
    const id = `p-${this.seq++}`;
    const product: ProductDto = {
      id,
      name: input.name,
      description: input.description,
      isActive: input.isActive ?? true,
      imageUrl: input.imageUrl ?? null,
      variants: input.variants.map((v, i) => ({
        id: `v-${id}-${i}`,
        productId: id,
        label: v.label,
        price: v.price,
        isActive: v.isActive ?? true,
      })),
    };
    this.products.set(id, product);
    return product;
  }
  async update(input: UpdateProductInput) {
    const p = this.products.get(input.id);
    if (!p) {
      throw new Error('missing');
    }
    const next = { ...p, ...input, imageUrl: input.imageUrl ?? p.imageUrl };
    this.products.set(input.id, next);
    return next;
  }
  async delete(id: string) {
    this.products.delete(id);
    return id;
  }
  async upsertVariant(): Promise<VariantDto> {
    throw new Error('not used');
  }
  async deleteVariant(id: string) {
    return id;
  }
  async countProducts() {
    return this.products.size;
  }
  async bulkInsert() {
    return 0;
  }
}

class MemCache implements CatalogCache {
  private products = new Map<string, ProductDto>();
  private lists = new Map<string, { items: ProductDto[]; total: number }>();
  async getProduct(id: string) {
    return this.products.get(id) ?? null;
  }
  async setProduct(p: ProductDto) {
    this.products.set(p.id, p);
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

class MemEvents implements EventPublisher {
  published: KafkaMessageEnvelope[] = [];
  async publish(m: KafkaMessageEnvelope) {
    this.published.push(m);
  }
}

class MemMedia implements MediaStore {
  async presignUpload() {
    return {
      uploadUrl: 'https://example/upload',
      publicUrl: 'https://example/public',
      objectKey: 'products/x/y.jpg',
      expiresIn: 900,
    };
  }
}

function build() {
  const events = new MemEvents();
  const cache = new MemCache();
  const service = new CatalogService({
    products: new MemRepo(),
    cache,
    events,
    media: new MemMedia(),
  });
  return { service, events, cache };
}

describe('CatalogService (FR-5/6 / §3.2)', () => {
  it('allows public list without admin', async () => {
    const { service } = build();
    await service.createProduct(
      {
        name: 'Wings',
        description: 'Crispy',
        variants: [{ label: '8pc', price: '12.99' }],
      },
      Role.Admin,
    );
    const list = await service.listProducts(1, 10);
    expect(list.total).toBe(1);
    expect(list.items[0].name).toBe('Wings');
  });

  it('blocks non-admin create', async () => {
    const { service } = build();
    await expect(
      service.createProduct(
        {
          name: 'Burger',
          description: '',
          variants: [{ label: 'Single', price: '9.99' }],
        },
        Role.Customer,
      ),
    ).rejects.toThrow(/Admin/i);
  });

  it('emits catalog.product.changed on create', async () => {
    const { service, events } = build();
    await service.createProduct(
      {
        name: 'Wings',
        description: '',
        variants: [
          { label: '8pc', price: '12.99' },
          { label: '16pc', price: '22.99' },
        ],
      },
      Role.Admin,
    );
    expect(events.published.some((e) => e.topic === 'catalog.product.changed')).toBe(true);
  });

  it('serves getProduct from cache after first read', async () => {
    const { service, cache } = build();
    const created = await service.createProduct(
      {
        name: 'Pizza',
        description: '',
        variants: [{ label: 'Regular', price: '15.00' }],
      },
      Role.Admin,
    );
    await service.getProduct(created.id);
    expect(await cache.getProduct(created.id)).toBeTruthy();
  });
});
