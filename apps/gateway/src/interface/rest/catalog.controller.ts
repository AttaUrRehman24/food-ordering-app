import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { GatewayGrpcClients } from '../../infrastructure/grpc/clients';
import { GatewayRateLimiter } from '../../infrastructure/redis/rate-limiter';
import { getClientIp } from '../../auth/auth.guards';
import { mapProduct } from './mappers';
import { NotFound, TooManyRequests } from './swagger.constants';
import { ProductListResponseDto, ProductResponseDto } from './swagger.models';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly grpc: GatewayGrpcClients,
    @Inject(GatewayRateLimiter) private readonly limiter: GatewayRateLimiter,
  ) {}

  @Get('products')
  @ApiOperation({
    summary: 'List products',
    description: 'Public paginated catalog. Prices are PKR decimal strings. IP rate-limited.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Max 100' })
  @ApiResponse({ status: 200, description: 'Paginated products with variants', type: ProductListResponseDto })
  @ApiResponse(TooManyRequests)
  async list(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const ok = await this.limiter.hit('catalog_read', getClientIp(req), 120, 60);
    if (!ok) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    const res = await this.grpc.callCatalog.list({
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    });
    return {
      products: (res.products ?? []).map(mapProduct),
      page: res.page,
      limit: res.limit,
      total: res.total,
    };
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Product with variants', type: ProductResponseDto })
  @ApiResponse(NotFound)
  @ApiResponse(TooManyRequests)
  async get(@Req() req: Request, @Param('id') id: string) {
    const ok = await this.limiter.hit('catalog_read', getClientIp(req), 120, 60);
    if (!ok) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    const product = await this.grpc.callCatalog.get({ id });
    return mapProduct(product);
  }
}
