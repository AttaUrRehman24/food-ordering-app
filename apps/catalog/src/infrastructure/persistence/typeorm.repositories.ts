import { DataSource, EntityManager } from 'typeorm';
import type { ProductRepository } from '../../application/ports';
import type {
  CreateProductInput,
  ProductDto,
  UpdateProductInput,
  VariantDto,
} from '../../domain/types';
import { NotFoundError } from '../../domain/errors';
import { Product } from './entities/product.entity';
import { Variant } from './entities/variant.entity';

function mapVariant(v: Variant): VariantDto {
  return {
    id: v.id,
    productId: v.productId,
    label: v.label,
    price: String(v.price),
    isActive: v.isActive,
  };
}

function mapProduct(p: Product): ProductDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    imageUrl: p.imageUrl,
    variants: (p.variants ?? []).map(mapVariant),
  };
}

export class TypeOrmProductRepository implements ProductRepository {
  constructor(private readonly em: EntityManager) {}

  private products() {
    return this.em.getRepository(Product);
  }

  private variants() {
    return this.em.getRepository(Variant);
  }

  async list(page: number, limit: number): Promise<{ items: ProductDto[]; total: number }> {
    const [rows, total] = await this.products().findAndCount({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { variants: true },
    });
    return { items: rows.map(mapProduct), total };
  }

  async findById(id: string): Promise<ProductDto | null> {
    const product = await this.products().findOne({
      where: { id },
      relations: { variants: true },
    });
    return product ? mapProduct(product) : null;
  }

  async create(input: CreateProductInput): Promise<ProductDto> {
    const product = this.products().create({
      name: input.name,
      description: input.description,
      isActive: input.isActive ?? true,
      imageUrl: input.imageUrl ?? null,
      variants: input.variants.map((v) =>
        this.variants().create({
          label: v.label,
          price: v.price,
          isActive: v.isActive ?? true,
        }),
      ),
    });
    const saved = await this.products().save(product);
    return mapProduct(saved);
  }

  async update(input: UpdateProductInput): Promise<ProductDto> {
    const product = await this.products().findOne({
      where: { id: input.id },
      relations: { variants: true },
    });
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    if (input.name !== undefined) {
      product.name = input.name;
    }
    if (input.description !== undefined) {
      product.description = input.description;
    }
    if (input.isActive !== undefined) {
      product.isActive = input.isActive;
    }
    if (input.imageUrl !== undefined) {
      product.imageUrl = input.imageUrl;
    }
    const saved = await this.products().save(product);
    return mapProduct(saved);
  }

  async delete(id: string): Promise<string> {
    const result = await this.products().delete({ id });
    if (!result.affected) {
      throw new NotFoundError('Product not found');
    }
    return id;
  }

  async upsertVariant(input: {
    id?: string;
    productId: string;
    label: string;
    price: string;
    isActive?: boolean;
  }): Promise<VariantDto> {
    if (input.id) {
      const existing = await this.variants().findOneBy({ id: input.id });
      if (!existing) {
        throw new NotFoundError('Variant not found');
      }
      existing.label = input.label;
      existing.price = input.price;
      existing.isActive = input.isActive ?? existing.isActive;
      const saved = await this.variants().save(existing);
      return mapVariant(saved);
    }
    const created = this.variants().create({
      productId: input.productId,
      label: input.label,
      price: input.price,
      isActive: input.isActive ?? true,
    });
    const saved = await this.variants().save(created);
    return mapVariant(saved);
  }

  async deleteVariant(id: string): Promise<string> {
    const result = await this.variants().delete({ id });
    if (!result.affected) {
      throw new NotFoundError('Variant not found');
    }
    return id;
  }

  async countProducts(): Promise<number> {
    return this.products().count();
  }

  async bulkInsert(products: CreateProductInput[]): Promise<number> {
    if (products.length === 0) {
      return 0;
    }
    const entities = products.map((input) =>
      this.products().create({
        name: input.name,
        description: input.description,
        isActive: input.isActive ?? true,
        imageUrl: input.imageUrl ?? null,
        variants: input.variants.map((v) =>
          this.variants().create({
            label: v.label,
            price: v.price,
            isActive: v.isActive ?? true,
          }),
        ),
      }),
    );
    await this.products().save(entities, { chunk: 500 });
    return entities.length;
  }
}

export function createProductRepository(dataSource: DataSource): TypeOrmProductRepository {
  return new TypeOrmProductRepository(dataSource.manager);
}
