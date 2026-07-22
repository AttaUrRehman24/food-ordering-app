import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { OrderService } from '../../application/order.service';
import { DomainError } from '../../domain/errors';
import type { OrderDto, OrderSummaryDto } from '../../domain/types';

function mapOrder(o: OrderDto) {
  return {
    id: o.id,
    userId: o.userId,
    total: o.total,
    paymentType: o.paymentType,
    status: o.status,
    createdAt: o.createdAt,
    softDeleted: o.softDeleted,
    items: o.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productNameSnapshot: i.productNameSnapshot,
      variantLabelSnapshot: i.variantLabelSnapshot,
      unitPriceSnapshot: i.unitPriceSnapshot,
      quantity: i.quantity,
    })),
    statusHistory: o.statusHistory.map((h) => ({
      id: h.id,
      status: h.status,
      at: h.at,
    })),
  };
}

function mapSummary(o: OrderSummaryDto) {
  return {
    id: o.id,
    userId: o.userId ?? '',
    total: o.total,
    status: o.status,
    paymentType: o.paymentType,
    createdAt: o.createdAt,
    itemCount: o.itemCount,
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
            : err.httpStatus === 422
              ? GrpcStatus.FAILED_PRECONDITION
              : GrpcStatus.INTERNAL;
    return new RpcException({ code, message: err.message });
  }
  return new RpcException({
    code: GrpcStatus.INTERNAL,
    message: err instanceof Error ? err.message : 'Internal error',
  });
}

function isAdmin(metadata?: Metadata): boolean {
  if (!metadata) {
    return false;
  }
  const role = String(metadata.get('x-user-role')[0] ?? metadata.get('role')[0] ?? '');
  return role === 'admin';
}

@Controller()
export class OrderGrpcController {
  constructor(private readonly orders: OrderService) {}

  @GrpcMethod('OrderService', 'PlaceOrder')
  async placeOrder(data: { userId: string; paymentType: string; idempotencyKey: string }) {
    try {
      const res = await this.orders.placeOrder(data);
      return {
        orderId: res.orderId,
        status: res.status,
        total: res.total,
      };
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('OrderService', 'GetOrder')
  async getOrder(
    data: { orderId: string; userId: string; asAdmin?: boolean },
    metadata: Metadata,
  ) {
    try {
      const asAdmin = data.asAdmin === true || isAdmin(metadata);
      return mapOrder(await this.orders.getOrder(data.orderId, data.userId, asAdmin));
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('OrderService', 'ListMyOrders')
  async listMyOrders(data: { userId: string; page?: number; limit?: number }) {
    try {
      const res = await this.orders.listMyOrders(data.userId, data.page ?? 1, data.limit ?? 10);
      return {
        orders: res.items.map(mapSummary),
        page: res.page,
        limit: res.limit,
        total: res.total,
      };
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('OrderService', 'ListOrders')
  async listOrders(data: { page?: number; limit?: number; asAdmin?: boolean }, metadata: Metadata) {
    try {
      if (!(data.asAdmin === true || isAdmin(metadata))) {
        throw new RpcException({
          code: GrpcStatus.PERMISSION_DENIED,
          message: 'Admin role required',
        });
      }
      const res = await this.orders.listAllOrders(data.page ?? 1, data.limit ?? 10);
      return {
        orders: res.items.map(mapSummary),
        page: res.page,
        limit: res.limit,
        total: res.total,
      };
    } catch (err) {
      if (err instanceof RpcException) {
        throw err;
      }
      throw toRpc(err);
    }
  }

  @GrpcMethod('OrderService', 'CancelOrder')
  async cancelOrder(
    data: { orderId: string; userId: string; asAdmin?: boolean },
    metadata: Metadata,
  ) {
    try {
      const asAdmin = data.asAdmin === true || isAdmin(metadata);
      return mapOrder(
        await this.orders.cancelOrder({
          orderId: data.orderId,
          userId: data.userId,
          asAdmin,
        }),
      );
    } catch (err) {
      throw toRpc(err);
    }
  }
}
