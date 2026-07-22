import { randomUUID } from 'crypto';
import { Role } from '@food-ordering/domain';
import { KafkaTopics } from '@food-ordering/kafka';
import { ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
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

export interface CatalogServiceDeps {
  products: ProductRepository;
  cache: CatalogCache;
  events: EventPublisher;
  media: MediaStore;
}

function assertAdmin(role?: string): void {
  if (role !== Role.Admin) {
    throw new ForbiddenError('Admin role required');
  }
}

function assertPrice(price: string): void {
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError('Invalid price');
  }
}

export class CatalogService {
  constructor(private readonly deps: CatalogServiceDeps) {}

  /** Public read — cache-first (Article IV.2 / §7) */
  async listProducts(page = 1, limit = 20): Promise<{ items: ProductDto[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const cached = await this.deps.cache.getList(safePage, safeLimit);
    if (cached) {
      return { ...cached, page: safePage, limit: safeLimit };
    }

    const data = await this.deps.products.list(safePage, safeLimit);
    await this.deps.cache.setList(safePage, safeLimit, data);
    return { ...data, page: safePage, limit: safeLimit };
  }

  async getProduct(id: string): Promise<ProductDto> {
    const cached = await this.deps.cache.getProduct(id);
    if (cached) {
      return cached;
    }
    const product = await this.deps.products.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    await this.deps.cache.setProduct(product);
    return product;
  }

  async createProduct(input: CreateProductInput, role?: string): Promise<ProductDto> {
    assertAdmin(role);
    if (!input.name?.trim()) {
      throw new ValidationError('name is required');
    }
    if (!input.variants?.length) {
      throw new ValidationError('at least one variant is required');
    }
    for (const v of input.variants) {
      assertPrice(v.price);
      if (!v.label?.trim()) {
        throw new ValidationError('variant label is required');
      }
    }

    const product = await this.deps.products.create({
      ...input,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      isActive: input.isActive ?? true,
    });

    await this.afterMutation(product.id, 'created');
    return product;
  }

  async updateProduct(input: UpdateProductInput, role?: string): Promise<ProductDto> {
    assertAdmin(role);
    const existing = await this.deps.products.findById(input.id);
    if (!existing) {
      throw new NotFoundError('Product not found');
    }
    const product = await this.deps.products.update(input);
    await this.afterMutation(product.id, 'updated');
    return product;
  }

  async deleteProduct(id: string, role?: string): Promise<{ id: string }> {
    assertAdmin(role);
    const deletedId = await this.deps.products.delete(id);
    await this.afterMutation(deletedId, 'deleted');
    return { id: deletedId };
  }

  async upsertVariant(
    input: {
      id?: string;
      productId: string;
      label: string;
      price: string;
      isActive?: boolean;
    },
    role?: string,
  ): Promise<VariantDto> {
    assertAdmin(role);
    assertPrice(input.price);
    if (!input.label?.trim()) {
      throw new ValidationError('variant label is required');
    }
    const product = await this.deps.products.findById(input.productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    const variant = await this.deps.products.upsertVariant(input);
    await this.afterMutation(input.productId, 'variant_upserted');
    return variant;
  }

  async deleteVariant(id: string, role?: string): Promise<{ id: string }> {
    assertAdmin(role);
    // Resolve product before delete for targeted cache invalidation
    // Repository delete returns id only — invalidate lists + emit event
    const variantId = await this.deps.products.deleteVariant(id);
    await this.deps.cache.invalidateLists();
    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: KafkaTopics.CatalogProductChanged,
      key: variantId,
      payload: { variantId, action: 'variant_deleted' },
      occurredAt: new Date().toISOString(),
    });
    return { id: variantId };
  }

  async presignProductImage(
    input: { productId: string; contentType: string; fileExtension: string },
    role?: string,
  ): Promise<{ uploadUrl: string; publicUrl: string; objectKey: string; expiresIn: number }> {
    assertAdmin(role);
    const product = await this.deps.products.findById(input.productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    if (!input.contentType?.startsWith('image/')) {
      throw new ValidationError('contentType must be an image/* type');
    }
    return this.deps.media.presignUpload(input);
  }

  private async afterMutation(productId: string, action: string): Promise<void> {
    await this.deps.cache.invalidateProduct(productId);
    await this.deps.cache.invalidateLists();
    await this.deps.events.publish({
      eventId: randomUUID(),
      topic: KafkaTopics.CatalogProductChanged,
      key: productId,
      payload: { productId, action },
      occurredAt: new Date().toISOString(),
    });
  }
}
