import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { CartService } from '../../application/cart.service';
import { DomainError } from '../../domain/errors';
import type { CartDto } from '../../domain/cart';

function mapCart(cart: CartDto) {
  return {
    userId: cart.userId,
    items: cart.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      label: i.label,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
    })),
    total: cart.total,
    itemCount: cart.itemCount,
  };
}

function toRpc(err: unknown): RpcException {
  if (err instanceof DomainError) {
    const code =
      err.httpStatus === 400
        ? GrpcStatus.INVALID_ARGUMENT
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

@Controller()
export class CartGrpcController {
  constructor(private readonly cart: CartService) {}

  @GrpcMethod('CartService', 'GetCart')
  async getCart(data: { userId: string }) {
    try {
      return mapCart(await this.cart.getCart(data.userId));
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CartService', 'AddItem')
  async addItem(data: {
    userId: string;
    productId: string;
    variantId: string;
    quantity: number;
  }) {
    try {
      return mapCart(
        await this.cart.addItem(
          data.userId,
          data.productId,
          data.variantId,
          data.quantity,
        ),
      );
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CartService', 'UpdateItem')
  async updateItem(data: {
    userId: string;
    productId: string;
    variantId: string;
    quantity: number;
  }) {
    try {
      return mapCart(
        await this.cart.updateItem(
          data.userId,
          data.productId,
          data.variantId,
          data.quantity,
        ),
      );
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CartService', 'RemoveItem')
  async removeItem(data: { userId: string; productId: string; variantId: string }) {
    try {
      return mapCart(
        await this.cart.removeItem(data.userId, data.productId, data.variantId),
      );
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CartService', 'ClearCart')
  async clearCart(data: { userId: string }) {
    try {
      return mapCart(await this.cart.clearCart(data.userId));
    } catch (err) {
      throw toRpc(err);
    }
  }

  @GrpcMethod('CartService', 'PriceCart')
  async priceCart(data: { userId: string }) {
    try {
      return mapCart(await this.cart.priceCart(data.userId));
    } catch (err) {
      throw toRpc(err);
    }
  }
}
