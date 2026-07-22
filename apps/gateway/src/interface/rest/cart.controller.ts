import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard, CustomerGuard, type GatewayUser } from '../../auth/auth.guards';
import { GatewayGrpcClients } from '../../infrastructure/grpc/clients';
import { CartItemDto } from './dto';
import { mapCart } from './mappers';
import { BadRequest, Forbidden, Unauthorized } from './swagger.constants';
import { CartResponseDto } from './swagger.models';

@ApiTags('cart')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, CustomerGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly grpc: GatewayGrpcClients) {}

  @Get()
  @ApiOperation({ summary: 'Get my cart', description: 'Customer role only. Admin receives 403.' })
  @ApiOkResponse({ description: 'Cart with line items and PKR total', type: CartResponseDto })
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async get(@Req() req: Request & { user?: GatewayUser }) {
    const cart = await this.grpc.callCart.get({ userId: req.user!.userId });
    return mapCart(cart);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiBody({ type: CartItemDto })
  @ApiOkResponse({ description: 'Updated cart', type: CartResponseDto })
  @ApiResponse(BadRequest)
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async add(@Req() req: Request & { user?: GatewayUser }, @Body() body: CartItemDto) {
    const cart = await this.grpc.callCart.add({
      userId: req.user!.userId,
      productId: body.productId,
      variantId: body.variantId,
      quantity: body.quantity ?? 1,
    });
    return mapCart(cart);
  }

  @Patch('items')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiBody({ type: CartItemDto })
  @ApiOkResponse({ description: 'Updated cart', type: CartResponseDto })
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async update(@Req() req: Request & { user?: GatewayUser }, @Body() body: CartItemDto) {
    const cart = await this.grpc.callCart.update({
      userId: req.user!.userId,
      productId: body.productId,
      variantId: body.variantId,
      quantity: body.quantity ?? 1,
    });
    return mapCart(cart);
  }

  @Delete('items')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiBody({ type: CartItemDto })
  @ApiOkResponse({ description: 'Updated cart', type: CartResponseDto })
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async remove(@Req() req: Request & { user?: GatewayUser }, @Body() body: CartItemDto) {
    const cart = await this.grpc.callCart.remove({
      userId: req.user!.userId,
      productId: body.productId,
      variantId: body.variantId,
    });
    return mapCart(cart);
  }
}
