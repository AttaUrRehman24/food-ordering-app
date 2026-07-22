import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Documented response models for professional OpenAPI output */

export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ali Khan' })
  name!: string;

  @ApiProperty({ example: 'ali@example.com' })
  email!: string;

  @ApiProperty({ example: '+923001234567' })
  phone!: string;

  @ApiProperty({ enum: ['customer', 'admin'], example: 'customer' })
  role!: string;

  @ApiPropertyOptional()
  createdAt?: string;
}

export class AuthTokensResponseDto {
  @ApiProperty({
    description: 'RS256 JWT access token (~15m). Send as Authorization: Bearer',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiPropertyOptional({
    description: 'Refresh token (also set as httpOnly cookie refresh_token)',
  })
  refreshToken?: string;

  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;
}

export class OtpRequestResponseDto {
  @ApiProperty({ example: 'OTP sent' })
  message!: string;

  @ApiProperty({ example: 300, description: 'TTL seconds' })
  expiresIn!: number;
}

export class VariantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Regular' })
  label!: string;

  @ApiProperty({ example: '450.00', description: 'PKR decimal string' })
  price!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Chicken Biryani' })
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/...' })
  imageUrl?: string | null;

  @ApiProperty({ type: [VariantResponseDto] })
  variants!: VariantResponseDto[];
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  products!: ProductResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 36 })
  total!: number;
}

export class CartItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  variantId!: string;

  @ApiProperty({ example: 'Chicken Biryani (Regular)' })
  label!: string;

  @ApiProperty({ example: '450.00', description: 'PKR unit price' })
  unitPrice!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;
}

export class CartResponseDto {
  @ApiProperty({ type: [CartItemResponseDto] })
  items!: CartItemResponseDto[];

  @ApiProperty({ example: '900.00', description: 'PKR total' })
  total!: string;

  @ApiProperty({ example: 2 })
  itemCount!: number;
}

export class PlaceOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ example: 'pending', enum: ['pending', 'paid', 'failed', 'cancelled'] })
  status!: string;

  @ApiProperty({ example: '450.00', description: 'PKR' })
  total!: string;
}

export class OrderSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Present on admin list-all' })
  userId?: string;

  @ApiProperty({ example: '450.00' })
  total!: string;

  @ApiProperty({ example: 'paid' })
  status!: string;

  @ApiProperty({ example: 'COD' })
  paymentType!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ example: 1 })
  itemCount!: number;
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderSummaryResponseDto] })
  orders!: OrderSummaryResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Logged out' })
  message!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Validation failed',
  })
  message!: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error!: string;
}
