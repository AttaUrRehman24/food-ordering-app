import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { CatalogService } from '../../application/catalog.service';
import { DomainError } from '../../domain/errors';
import type { ProductDto, VariantDto } from '../../domain/types';

function mapProduct(p: ProductDto) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    imageUrl: p.imageUrl ?? '',
    variants: p.variants.map(mapVariant),
  };
}

function mapVariant(v: VariantDto) {
  return {
    id: v.id,
    productId: v.productId,
    label: v.label,
    price: v.price,
    isActive: v.isActive,
  };
}

function toRpc(err: unknown): RpcException {
  if (err instanceof DomainError) {
    const code =
      err.httpStatus === 400
        ? GrpcStatus.INVALID_ARGUMENT
        : err.httpStatus === 403
          ? GrpcStatus.PERMISSION_DENIED
          : err.httpStatus === 404
            ? GrpcStatus.NOT_FOUND
            : GrpcStatus.INTERNAL;
    return new RpcException({ code, message: err.message });
  }
  return new RpcException({
    code: GrpcStatus.INTERNAL,
    message: err instanceof Error ? err.message : 'Internal error',
  });
}

/** Gateway forwards JWT role via gRPC metadata ( Documentation §3.2 admin RBAC). */
function roleFromMetadata(metadata?: Metadata): string | undefined {
  if (!metadata) {
    return undefined;
  }
  const raw =
    metadata.get('x-user-role')[0] ??
    metadata.get('role')[0] ??
    metadata.get('user-role')[0];
  return raw !== undefined ? String(raw) : undefined;
}

@Controller()
export class CatalogGrpcController {
  constructor(private readonly catalog: CatalogService) {}

  @GrpcMethod('CatalogService', 'ListProducts')
  async listProducts(data: { page?: number; limit?: number }) {
    try {
      const res = await this.catalog.listProducts(data.page ?? 1, data.limit ?? 20);
      return {
        products: res.items.map(mapProduct),
        page: res.page,
        limit: res.limit,
        total: res.total,
      };
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CatalogService', 'GetProduct')
  async getProduct(data: { id: string }) {
    try {
      return mapProduct(await this.catalog.getProduct(data.id));
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CatalogService', 'CreateProduct')
  async createProduct(
    data: {
      name: string;
      description: string;
      isActive?: boolean;
      imageUrl?: string;
      variants: Array<{ label: string; price: string; isActive?: boolean }>;
    },
    metadata: Metadata,
  ) {
    try {
      return mapProduct(
        await this.catalog.createProduct(
          {
            name: data.name,
            description: data.description,
            isActive: data.isActive,
            imageUrl: data.imageUrl || null,
            variants: data.variants ?? [],
          },
          roleFromMetadata(metadata),
        ),
      );
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CatalogService', 'UpdateProduct')
  async updateProduct(
    data: {
      id: string;
      name?: string;
      description?: string;
      isActive?: boolean;
      imageUrl?: string;
    },
    metadata: Metadata,
  ) {
    try {
      return mapProduct(
        await this.catalog.updateProduct(
          {
            id: data.id,
            name: data.name,
            description: data.description,
            isActive: data.isActive,
            imageUrl: data.imageUrl,
          },
          roleFromMetadata(metadata),
        ),
      );
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CatalogService', 'DeleteProduct')
  async deleteProduct(data: { id: string }, metadata: Metadata) {
    try {
      return await this.catalog.deleteProduct(data.id, roleFromMetadata(metadata));
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CatalogService', 'UpsertVariant')
  async upsertVariant(
    data: {
      id?: string;
      productId: string;
      label: string;
      price: string;
      isActive?: boolean;
    },
    metadata: Metadata,
  ) {
    try {
      return mapVariant(
        await this.catalog.upsertVariant(
          {
            id: data.id || undefined,
            productId: data.productId,
            label: data.label,
            price: data.price,
            isActive: data.isActive,
          },
          roleFromMetadata(metadata),
        ),
      );
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CatalogService', 'DeleteVariant')
  async deleteVariant(data: { id: string }, metadata: Metadata) {
    try {
      return await this.catalog.deleteVariant(data.id, roleFromMetadata(metadata));
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CatalogService', 'PresignProductImage')
  async presignProductImage(
    data: { productId: string; contentType: string; fileExtension: string },
    metadata: Metadata,
  ) {
    try {
      return await this.catalog.presignProductImage(
        {
          productId: data.productId,
          contentType: data.contentType,
          fileExtension: data.fileExtension,
        },
        roleFromMetadata(metadata),
      );
    } catch (err) {
      throw toRpc(err);
    }
  }
}
