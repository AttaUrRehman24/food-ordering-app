import type { KafkaMessageEnvelope } from '@food-ordering/kafka';
import type {
  CreateProductInput,
  ProductDto,
  UpdateProductInput,
  VariantDto,
  VariantInput,
} from '../domain/types';

export const PRODUCT_REPO = Symbol('PRODUCT_REPO');
export const CATALOG_CACHE = Symbol('CATALOG_CACHE');
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
export const MEDIA_STORE = Symbol('MEDIA_STORE');

export interface ProductRepository {
  list(page: number, limit: number): Promise<{ items: ProductDto[]; total: number }>;
  findById(id: string): Promise<ProductDto | null>;
  create(input: CreateProductInput): Promise<ProductDto>;
  update(input: UpdateProductInput): Promise<ProductDto>;
  delete(id: string): Promise<string>;
  upsertVariant(input: {
    id?: string;
    productId: string;
    label: string;
    price: string;
    isActive?: boolean;
  }): Promise<VariantDto>;
  deleteVariant(id: string): Promise<string>;
  countProducts(): Promise<number>;
  bulkInsert(products: CreateProductInput[]): Promise<number>;
}

export interface CatalogCache {
  getProduct(id: string): Promise<ProductDto | null>;
  setProduct(product: ProductDto): Promise<void>;
  getList(page: number, limit: number): Promise<{ items: ProductDto[]; total: number } | null>;
  setList(page: number, limit: number, data: { items: ProductDto[]; total: number }): Promise<void>;
  invalidateProduct(id: string): Promise<void>;
  invalidateLists(): Promise<void>;
}

export interface EventPublisher {
  publish(message: KafkaMessageEnvelope): Promise<void>;
}

export interface MediaStore {
  presignUpload(input: {
    productId: string;
    contentType: string;
    fileExtension: string;
  }): Promise<{ uploadUrl: string; publicUrl: string; objectKey: string; expiresIn: number }>;
}

export type { CreateProductInput, ProductDto, UpdateProductInput, VariantDto, VariantInput };
