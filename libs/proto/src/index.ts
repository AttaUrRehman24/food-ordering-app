/**
 * gRPC contract paths and service names ( Documentation §3.2, TDR-2).
 * `.proto` sources live under `libs/proto/protos/`. Codegen runs in later milestones.
 */

export const ProtoFiles = {
  identity: 'libs/proto/protos/identity.proto',
  catalog: 'libs/proto/protos/catalog.proto',
  cart: 'libs/proto/protos/cart.proto',
  order: 'libs/proto/protos/order.proto',
} as const;

export const GrpcServices = {
  Identity: 'foodordering.identity.v1.IdentityService',
  Catalog: 'foodordering.catalog.v1.CatalogService',
  Cart: 'foodordering.cart.v1.CartService',
  Order: 'foodordering.order.v1.OrderService',
} as const;

export const ProtoPackageRoots = {
  identity: 'foodordering.identity.v1',
  catalog: 'foodordering.catalog.v1',
  cart: 'foodordering.cart.v1',
  order: 'foodordering.order.v1',
} as const;
