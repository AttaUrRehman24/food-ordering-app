import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard, CustomerGuard, type GatewayUser } from '../../auth/auth.guards';
import { GatewayGrpcClients } from '../../infrastructure/grpc/clients';
import { PlaceOrderDto } from './dto';
import { Role } from '@food-ordering/domain';
import { getBusinessMetrics } from '@food-ordering/observability';
import {
  BadRequest,
  Forbidden,
  NotFound,
  Unauthorized,
  Unprocessable,
} from './swagger.constants';
import { OrderListResponseDto, PlaceOrderResponseDto } from './swagger.models';

@ApiTags('orders')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, CustomerGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly grpc: GatewayGrpcClients) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Place order from cart',
    description:
      'Customer only. Requires Idempotency-Key. Clears cart after accept. Payment finalized asynchronously.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Client-generated unique key (UUID recommended)',
    example: '9f3c1a2b-4d5e-6789-abcd-ef0123456789',
  })
  @ApiBody({ type: PlaceOrderDto })
  @ApiAcceptedResponse({
    description:
      'Order accepted (async). Payment/status finalized via Kafka outbox workers — poll GET /orders/{id} or WS.',
    type: PlaceOrderResponseDto,
  })
  @ApiResponse(BadRequest)
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  @ApiResponse(Unprocessable)
  async place(
    @Req() req: Request & { user?: GatewayUser },
    @Body() body: PlaceOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header required');
    }
    try {
      const res = await this.grpc.callOrder.place({
        userId: req.user!.userId,
        paymentType: body.paymentType,
        idempotencyKey,
      });
      getBusinessMetrics().orderAcceptTotal.inc({ service: 'gateway', result: 'accepted' });
      return {
        orderId: res.orderId,
        status: res.status,
        total: res.total,
      };
    } catch (err) {
      getBusinessMetrics().orderAcceptTotal.inc({ service: 'gateway', result: 'error' });
      throw err;
    }
  }

  @Get()
  @ApiOperation({ summary: 'List my orders', description: 'Customer’s orders only (paginated).' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiOkResponse({ description: 'Order summaries', type: OrderListResponseDto })
  @ApiResponse(Unauthorized)
  @ApiResponse(Forbidden)
  async list(
    @Req() req: Request & { user?: GatewayUser },
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const res = await this.grpc.callOrder.list({
      userId: req.user!.userId,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(50, Math.max(1, Number(limit) || 10)),
    });
    return {
      orders: (res.orders ?? []).map((o) => ({
        id: o.id,
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

  @Get(':id')
  @ApiOperation({
    summary: 'Get order detail',
    description: 'Owners see their order. Admins can also fetch via AdminGuard routes under /admin/orders.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Full order with items + status history' })
  @ApiResponse(NotFound)
  @ApiResponse(Unauthorized)
  async get(@Req() req: Request & { user?: GatewayUser }, @Param('id') id: string) {
    const order = await this.grpc.callOrder.get({
      orderId: id,
      userId: req.user!.userId,
      asAdmin: req.user!.role === Role.Admin,
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
}
