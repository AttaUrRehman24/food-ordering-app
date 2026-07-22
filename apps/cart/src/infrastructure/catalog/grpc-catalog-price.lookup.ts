import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import type { CatalogPriceLookup, VariantPrice } from '../../application/ports';

type CatalogGrpc = {
  GetProduct: (
    req: { id: string },
    cb: (err: grpc.ServiceError | null, res: {
      id: string;
      variants: Array<{
        id: string;
        productId: string;
        label: string;
        price: string;
        isActive: boolean;
      }>;
    }) => void,
  ) => void;
};

/**
 * Catalog variant price lookup via gRPC ( Documentation §3.2 Cart → Catalog dependency).
 */
export class GrpcCatalogPriceLookup implements CatalogPriceLookup {
  private client: CatalogGrpc;

  constructor(catalogGrpcUrl = process.env.CATALOG_GRPC_URL ?? 'localhost:50052') {
    const packageDef = protoLoader.loadSync(
      join(process.cwd(), 'libs/proto/protos/catalog.proto'),
      {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    );
    const proto = grpc.loadPackageDefinition(packageDef) as unknown as {
      foodordering: {
        catalog: {
          v1: {
            CatalogService: new (
              address: string,
              creds: grpc.ChannelCredentials,
            ) => CatalogGrpc;
          };
        };
      };
    };
    this.client = new proto.foodordering.catalog.v1.CatalogService(
      catalogGrpcUrl,
      grpc.credentials.createInsecure(),
    );
  }

  async getVariantPrice(
    productId: string,
    variantId: string,
  ): Promise<VariantPrice | null> {
    const product = await new Promise<{
      id: string;
      variants: Array<{
        id: string;
        productId: string;
        label: string;
        price: string;
        isActive: boolean;
      }>;
    }>((resolve, reject) => {
      this.client.GetProduct({ id: productId }, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });

    const variant = product.variants?.find((v) => v.id === variantId);
    if (!variant) {
      return null;
    }
    return {
      productId,
      variantId: variant.id,
      label: variant.label,
      unitPrice: variant.price,
      isActive: variant.isActive,
    };
  }
}

export class InMemoryCatalogPriceLookup implements CatalogPriceLookup {
  constructor(
    private readonly variants = new Map<string, VariantPrice>(),
  ) {}

  seed(v: VariantPrice): void {
    this.variants.set(`${v.productId}:${v.variantId}`, v);
  }

  async getVariantPrice(productId: string, variantId: string) {
    return this.variants.get(`${productId}:${variantId}`) ?? null;
  }
}
