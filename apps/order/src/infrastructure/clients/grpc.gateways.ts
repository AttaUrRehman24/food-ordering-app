import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import type { CartGateway, CartSnapshot, CatalogGateway } from '../../application/ports';

type CartGrpc = {
  GetCart: (
    req: { userId: string },
    cb: (
      err: grpc.ServiceError | null,
      res: {
        userId: string;
        items: Array<{
          productId: string;
          variantId: string;
          label: string;
          unitPrice: string;
          quantity: number;
        }>;
        total: string;
      },
    ) => void,
  ) => void;
  ClearCart: (
    req: { userId: string },
    cb: (err: grpc.ServiceError | null, res: unknown) => void,
  ) => void;
};

type CatalogGrpc = {
  GetProduct: (
    req: { id: string },
    cb: (
      err: grpc.ServiceError | null,
      res: {
        id: string;
        name: string;
        variants: Array<{
          id: string;
          label: string;
          price: string;
          isActive: boolean;
        }>;
      },
    ) => void,
  ) => void;
};

function loadClient<T>(protoPath: string, pkgPath: string[], url: string): T {
  const def = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const pkg = grpc.loadPackageDefinition(def) as unknown as Record<string, unknown>;
  let cur: unknown = pkg;
  for (const p of pkgPath) {
    cur = (cur as Record<string, unknown>)[p];
  }
  const Service = cur as new (address: string, creds: grpc.ChannelCredentials) => T;
  return new Service(url, grpc.credentials.createInsecure());
}

export class GrpcCartGateway implements CartGateway {
  private client: CartGrpc;

  constructor(url = process.env.CART_GRPC_URL ?? 'localhost:50053') {
    this.client = loadClient(
      join(process.cwd(), 'libs/proto/protos/cart.proto'),
      ['foodordering', 'cart', 'v1', 'CartService'],
      url,
    );
  }

  async getCart(userId: string): Promise<CartSnapshot> {
    const res = await new Promise<CartSnapshot>((resolve, reject) => {
      this.client.GetCart({ userId }, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          userId: data.userId,
          items: data.items ?? [],
          total: data.total,
        });
      });
    });
    return res;
  }

  async clearCart(userId: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.ClearCart({ userId }, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

export class GrpcCatalogGateway implements CatalogGateway {
  private client: CatalogGrpc;

  constructor(url = process.env.CATALOG_GRPC_URL ?? 'localhost:50052') {
    this.client = loadClient(
      join(process.cwd(), 'libs/proto/protos/catalog.proto'),
      ['foodordering', 'catalog', 'v1', 'CatalogService'],
      url,
    );
  }

  async resolveLine(productId: string, variantId: string) {
    const product = await new Promise<{
      id: string;
      name: string;
      variants: Array<{ id: string; label: string; price: string; isActive: boolean }>;
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
      productName: product.name,
      label: variant.label,
      unitPrice: variant.price,
      isActive: variant.isActive,
    };
  }
}
