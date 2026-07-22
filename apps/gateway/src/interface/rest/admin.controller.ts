import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminGuard, AuthGuard, type GatewayUser } from '../../auth/auth.guards';
import { GatewayGrpcClients } from '../../infrastructure/grpc/clients';
import { CreateProductDto, UpdateProductDto, UpsertVariantDto } from './dto';
import { mapProduct } from './mappers';
import { BadRequest, Forbidden, NotFound, Unauthorized } from './swagger.constants';
import { OrderListResponseDto, ProductResponseDto } from './swagger.models';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly grpc: GatewayGrpcClients) {}

  @Get('orders')
  @ApiOperation({
    summary: 'List all orders',
    description: 'Admin-only. Returns orders across all customers (PKR totals).',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Paginated order summaries with userId', type: OrderListResponseDto })
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async listOrders(@Query('page') page = '1', @Query('limit') limit = '20') {
    const res = await this.grpc.callOrder.listAll({
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(50, Math.max(1, Number(limit) || 20)),
      asAdmin: true,
    });
    return {
      orders: (res.orders ?? []).map((o) => ({
        id: o.id,
        userId: o.userId,
        total: o.total,
        status: o.status,
        paymentType: o.paymentType,
        createdAt: o.createdAt,
        itemCount: o.itemCount,
      })),
      page: res.page,
      limit: res.limit,
      total: res.total,
    };
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get any order (admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Full order detail' })
  @ApiResponse(NotFound)
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async getOrder(@Req() req: Request & { user?: GatewayUser }, @Param('id') id: string) {
    const order = await this.grpc.callOrder.get({
      orderId: id,
      userId: req.user!.userId,
      asAdmin: true,
    });
    return {
      id: order.id,
      userId: order.userId,
      total: order.total,
      paymentType: order.paymentType,
      status: order.status,
      createdAt: order.createdAt,
      softDeleted: order.softDeleted,
      items: (order.items ?? []).map((i) => ({
        id: i.id,
        variantId: i.variantId,
        productNameSnapshot: i.productNameSnapshot,
        variantLabelSnapshot: i.variantLabelSnapshot,
        unitPriceSnapshot: i.unitPriceSnapshot,
        quantity: i.quantity,
      })),
      statusHistory: (order.statusHistory ?? []).map((h) => ({
        id: h.id,
        status: h.status,
        at: h.at,
      })),
    };
  }

  @Post('products')
  @ApiOperation({ summary: 'Create product', description: 'Admin catalog write. Prices in PKR.' })
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({ status: 201, description: 'Created product', type: ProductResponseDto })
  @ApiResponse(BadRequest)
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async create(@Req() req: Request & { user?: GatewayUser }, @Body() body: CreateProductDto) {
    const product = await this.grpc.callCatalog.create(
      {
        name: body.name,
        description: body.description,
        isActive: body.isActive,
        variants: body.variants,
        imageUrl: body.imageUrl ?? '',
      },
      req.user!.role,
    );
    return mapProduct(product);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update product' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateProductDto })
  @ApiOkResponse({ description: 'Updated product', type: ProductResponseDto })
  @ApiResponse(NotFound)
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async update(
    @Req() req: Request & { user?: GatewayUser },
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ) {
    const product = await this.grpc.callCatalog.update(
      {
        id,
        name: body.name,
        description: body.description,
        isActive: body.isActive,
        imageUrl: body.imageUrl ?? '',
      },
      req.user!.role,
    );
    return mapProduct(product);
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete product' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse(NotFound)
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async remove(@Req() req: Request & { user?: GatewayUser }, @Param('id') id: string) {
    return this.grpc.callCatalog.delete({ id }, req.user!.role);
  }

  @Post('products/:productId/variants')
  @ApiOperation({ summary: 'Create or update variant' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiBody({ type: UpsertVariantDto })
  @ApiResponse({ status: 200, description: 'Variant upserted' })
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async upsertVariant(
    @Req() req: Request & { user?: GatewayUser },
    @Param('productId') productId: string,
    @Body() body: UpsertVariantDto,
  ) {
    return this.grpc.callCatalog.upsertVariant(
      {
        id: body.id ?? '',
        productId,
        label: body.label,
        price: body.price,
        isActive: body.isActive,
      },
      req.user!.role,
    );
  }

  @Delete('products/:productId/variants/:variantId')
  @ApiOperation({ summary: 'Delete variant' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiParam({ name: 'variantId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Variant deleted' })
  @ApiResponse(NotFound)
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async deleteVariant(
    @Req() req: Request & { user?: GatewayUser },
    @Param('variantId') variantId: string,
  ) {
    return this.grpc.callCatalog.deleteVariant({ id: variantId }, req.user!.role);
  }
}
