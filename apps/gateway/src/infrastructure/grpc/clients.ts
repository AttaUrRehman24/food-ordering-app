import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

const LOADER = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
} as const;

function loadClient<T>(protoFile: string, pkgPath: string[], url: string): T {
  const def = protoLoader.loadSync(join(process.cwd(), 'libs/proto/protos', protoFile), LOADER);
  const pkg = grpc.loadPackageDefinition(def) as unknown as Record<string, unknown>;
  let cur: unknown = pkg;
  for (const p of pkgPath) {
    cur = (cur as Record<string, unknown>)[p];
  }
  const Service = cur as new (address: string, creds: grpc.ChannelCredentials) => T;
  return new Service(url, grpc.credentials.createInsecure());
}

function unary<TReq, TRes>(
  fn: (req: TReq, cb: (err: grpc.ServiceError | null, res: TRes) => void) => void,
  req: TReq,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    fn(req, (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(res);
    });
  });
}

function unaryMeta<TReq, TRes>(
  fn: (
    req: TReq,
    meta: grpc.Metadata,
    cb: (err: grpc.ServiceError | null, res: TRes) => void,
  ) => void,
  req: TReq,
  meta: grpc.Metadata,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    fn(req, meta, (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(res);
    });
  });
}

export function roleMetadata(role: string): grpc.Metadata {
  const meta = new grpc.Metadata();
  meta.set('x-user-role', role);
  return meta;
}

/**  Documentation §3.2 — Gateway → Identity / Catalog / Cart / Order gRPC */
export class GatewayGrpcClients {
  readonly identity: IdentityGrpc;
  readonly catalog: CatalogGrpc;
  readonly cart: CartGrpc;
  readonly order: OrderGrpc;

  constructor() {
    this.identity = loadClient(
      'identity.proto',
      ['foodordering', 'identity', 'v1', 'IdentityService'],
      process.env.IDENTITY_GRPC_URL ?? 'localhost:50051',
    );
    this.catalog = loadClient(
      'catalog.proto',
      ['foodordering', 'catalog', 'v1', 'CatalogService'],
      process.env.CATALOG_GRPC_URL ?? 'localhost:50052',
    );
    this.cart = loadClient(
      'cart.proto',
      ['foodordering', 'cart', 'v1', 'CartService'],
      process.env.CART_GRPC_URL ?? 'localhost:50053',
    );
    this.order = loadClient(
      'order.proto',
      ['foodordering', 'order', 'v1', 'OrderService'],
      process.env.ORDER_GRPC_URL ?? 'localhost:50054',
    );
  }

  callIdentity = {
    register: (req: RegisterReq) => unary(this.identity.Register.bind(this.identity), req),
    login: (req: LoginReq) => unary(this.identity.LoginPassword.bind(this.identity), req),
    requestOtp: (req: OtpReq) => unary(this.identity.RequestOtp.bind(this.identity), req),
    verifyOtp: (req: VerifyOtpReq) => unary(this.identity.VerifyOtp.bind(this.identity), req),
    refresh: (req: { refreshToken: string }) =>
      unary(this.identity.Refresh.bind(this.identity), req),
    logout: (req: { accessJti: string; refreshToken: string }) =>
      unary(this.identity.Logout.bind(this.identity), req),
    logoutAll: (req: { userId: string }) =>
      unary(this.identity.LogoutAll.bind(this.identity), req),
    introspect: (req: { accessToken: string }) =>
      unary(this.identity.IntrospectToken.bind(this.identity), req),
    getMe: (req: { userId: string }) => unary(this.identity.GetMe.bind(this.identity), req),
    listSessions: (req: { userId: string }) =>
      unary(this.identity.ListSessions.bind(this.identity), req),
    revokeSession: (req: { userId: string; sessionId: string }) =>
      unary(this.identity.RevokeSession.bind(this.identity), req),
  };

  callCatalog = {
    list: (req: { page: number; limit: number }) =>
      unary(this.catalog.ListProducts.bind(this.catalog), req),
    get: (req: { id: string }) => unary(this.catalog.GetProduct.bind(this.catalog), req),
    create: (req: CreateProductReq, role: string) =>
      unaryMeta(this.catalog.CreateProduct.bind(this.catalog), req, roleMetadata(role)),
    update: (req: UpdateProductReq, role: string) =>
      unaryMeta(this.catalog.UpdateProduct.bind(this.catalog), req, roleMetadata(role)),
    delete: (req: { id: string }, role: string) =>
      unaryMeta(this.catalog.DeleteProduct.bind(this.catalog), req, roleMetadata(role)),
    upsertVariant: (req: UpsertVariantReq, role: string) =>
      unaryMeta(this.catalog.UpsertVariant.bind(this.catalog), req, roleMetadata(role)),
    deleteVariant: (req: { id: string }, role: string) =>
      unaryMeta(this.catalog.DeleteVariant.bind(this.catalog), req, roleMetadata(role)),
    presign: (req: PresignReq, role: string) =>
      unaryMeta(this.catalog.PresignProductImage.bind(this.catalog), req, roleMetadata(role)),
  };

  callCart = {
    get: (req: { userId: string }) => unary(this.cart.GetCart.bind(this.cart), req),
    add: (req: CartItemReq) => unary(this.cart.AddItem.bind(this.cart), req),
    update: (req: CartItemReq) => unary(this.cart.UpdateItem.bind(this.cart), req),
    remove: (req: Omit<CartItemReq, 'quantity'>) =>
      unary(this.cart.RemoveItem.bind(this.cart), req),
  };

  callOrder = {
    place: (req: PlaceOrderReq) => unary(this.order.PlaceOrder.bind(this.order), req),
    get: (req: { orderId: string; userId: string; asAdmin: boolean }) =>
      unary(this.order.GetOrder.bind(this.order), req),
    list: (req: { userId: string; page: number; limit: number }) =>
      unary(this.order.ListMyOrders.bind(this.order), req),
    listAll: (req: { page: number; limit: number; asAdmin: boolean }) =>
      unary(this.order.ListOrders.bind(this.order), req),
  };
}

type IdentityGrpc = {
  Register: (req: RegisterReq, cb: Cb<AuthTokens>) => void;
  LoginPassword: (req: LoginReq, cb: Cb<AuthTokens>) => void;
  RequestOtp: (req: OtpReq, cb: Cb<{ message: string; expiresIn: number }>) => void;
  VerifyOtp: (req: VerifyOtpReq, cb: Cb<AuthTokens>) => void;
  Refresh: (req: { refreshToken: string }, cb: Cb<AuthTokens>) => void;
  Logout: (req: { accessJti: string; refreshToken: string }, cb: Cb<{ message: string }>) => void;
  LogoutAll: (req: { userId: string }, cb: Cb<{ message: string }>) => void;
  IntrospectToken: (
    req: { accessToken: string },
    cb: Cb<{ active: boolean; userId: string; role: string; jti: string }>,
  ) => void;
  GetMe: (req: { userId: string }, cb: Cb<UserProfile>) => void;
  ListSessions: (req: { userId: string }, cb: Cb<{ sessions: SessionInfo[] }>) => void;
  RevokeSession: (
    req: { userId: string; sessionId: string },
    cb: Cb<{ message: string }>,
  ) => void;
};

type CatalogGrpc = {
  ListProducts: (req: { page: number; limit: number }, cb: Cb<ListProductsRes>) => void;
  GetProduct: (req: { id: string }, cb: Cb<Product>) => void;
  CreateProduct: (req: CreateProductReq, meta: grpc.Metadata, cb: Cb<Product>) => void;
  UpdateProduct: (req: UpdateProductReq, meta: grpc.Metadata, cb: Cb<Product>) => void;
  DeleteProduct: (req: { id: string }, meta: grpc.Metadata, cb: Cb<{ id: string }>) => void;
  UpsertVariant: (req: UpsertVariantReq, meta: grpc.Metadata, cb: Cb<Variant>) => void;
  DeleteVariant: (req: { id: string }, meta: grpc.Metadata, cb: Cb<{ id: string }>) => void;
  PresignProductImage: (
    req: PresignReq,
    meta: grpc.Metadata,
    cb: Cb<{ uploadUrl: string; publicUrl: string; objectKey: string; expiresIn: number }>,
  ) => void;
};

type CartGrpc = {
  GetCart: (req: { userId: string }, cb: Cb<Cart>) => void;
  AddItem: (req: CartItemReq, cb: Cb<Cart>) => void;
  UpdateItem: (req: CartItemReq, cb: Cb<Cart>) => void;
  RemoveItem: (req: Omit<CartItemReq, 'quantity'>, cb: Cb<Cart>) => void;
};

type OrderGrpc = {
  PlaceOrder: (req: PlaceOrderReq, cb: Cb<PlaceOrderRes>) => void;
  GetOrder: (
    req: { orderId: string; userId: string; asAdmin: boolean },
    cb: Cb<Order>,
  ) => void;
  ListMyOrders: (
    req: { userId: string; page: number; limit: number },
    cb: Cb<{ orders: OrderSummary[]; page: number; limit: number; total: number }>,
  ) => void;
  ListOrders: (
    req: { page: number; limit: number; asAdmin: boolean },
    cb: Cb<{ orders: OrderSummary[]; page: number; limit: number; total: number }>,
  ) => void;
};

type Cb<T> = (err: grpc.ServiceError | null, res: T) => void;

export type RegisterReq = { name: string; email: string; phone: string; password: string };
export type LoginReq = { identifier: string; password: string };
export type OtpReq = { identifier: string; type: string };
export type VerifyOtpReq = { identifier: string; code: string };
export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  createdAt: string;
};
export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
};
export type SessionInfo = {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastActive: string;
  current: boolean;
};
export type Variant = {
  id: string;
  productId: string;
  label: string;
  price: string;
  isActive: boolean;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  imageUrl: string;
  variants: Variant[];
};
export type ListProductsRes = {
  products: Product[];
  page: number;
  limit: number;
  total: number;
};
export type CreateProductReq = {
  name: string;
  description: string;
  isActive: boolean;
  variants: Array<{ label: string; price: string; isActive: boolean }>;
  imageUrl?: string;
};
export type UpdateProductReq = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  imageUrl?: string;
};
export type UpsertVariantReq = {
  id: string;
  productId: string;
  label: string;
  price: string;
  isActive: boolean;
};
export type PresignReq = {
  productId: string;
  contentType: string;
  fileExtension: string;
};
export type CartItemReq = {
  userId: string;
  productId: string;
  variantId: string;
  quantity: number;
};
export type Cart = {
  userId: string;
  items: Array<{
    productId: string;
    variantId: string;
    label: string;
    unitPrice: string;
    quantity: number;
  }>;
  total: string;
  itemCount: number;
};
export type PlaceOrderReq = {
  userId: string;
  paymentType: string;
  idempotencyKey: string;
};
export type PlaceOrderRes = { orderId: string; status: string; total: string };
export type OrderSummary = {
  id: string;
  userId?: string;
  total: string;
  status: string;
  paymentType: string;
  createdAt: string;
  itemCount: number;
};
export type Order = {
  id: string;
  userId: string;
  total: string;
  paymentType: string;
  status: string;
  createdAt: string;
  softDeleted: boolean;
  items: Array<{
    id: string;
    variantId: string;
    productNameSnapshot: string;
    variantLabelSnapshot: string;
    unitPriceSnapshot: string;
    quantity: number;
  }>;
  statusHistory: Array<{ id: string; status: string; at: string }>;
};
