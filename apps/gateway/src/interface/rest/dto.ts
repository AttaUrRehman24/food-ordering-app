import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Ali Khan', description: 'Display name' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'ali@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '+923001234567', description: 'Unique phone (E.164 preferred)' })
  @IsString()
  phone!: string;

  @ApiProperty({ minLength: 8, example: 'Secret123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'Email or phone registered on the account',
    example: 'ali@example.com',
  })
  @IsString()
  identifier!: string;

  @ApiProperty({ example: 'Secret123!' })
  @IsString()
  password!: string;
}

export class OtpRequestDto {
  @ApiProperty({
    example: 'ali@example.com',
    description: 'Email or phone used to find the user; OTP is always emailed',
  })
  @IsString()
  identifier!: string;

  @ApiProperty({
    enum: ['email', 'phone'],
    example: 'email',
    description: 'Request channel hint — delivery is email-only',
  })
  @IsIn(['email', 'phone'])
  type!: string;
}

export class OtpVerifyDto {
  @ApiProperty({ example: 'ali@example.com' })
  @IsString()
  identifier!: string;

  @ApiProperty({ example: '482915', description: '6-digit code; expires in 5 minutes' })
  @IsString()
  code!: string;
}

export class CartItemDto {
  @ApiProperty({ format: 'uuid', example: '0068ffd4-4065-4166-862c-90b5067633d8' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid', example: 'a5502185-55a0-4461-af1b-241890cedbfd' })
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({ minimum: 1, example: 1, description: 'Defaults to 1 when omitted' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class PlaceOrderDto {
  @ApiProperty({
    enum: ['COD', 'Card'],
    example: 'COD',
    description: 'Payment method; Card is mocked in local finalizer',
  })
  @IsIn(['COD', 'Card'])
  paymentType!: string;
}

export class VariantInputDto {
  @ApiProperty({ example: 'Regular' })
  @IsString()
  label!: string;

  @ApiProperty({ example: '450.00', description: 'PKR amount as decimal string' })
  @IsString()
  price!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Chicken Biryani' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Fragrant basmati rice with spiced chicken.' })
  @IsString()
  description!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ type: [VariantInputDto] })
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];

  @ApiPropertyOptional({
    example: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=640',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateProductDto {
  @ApiProperty({ example: 'Chicken Biryani' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Updated description' })
  @IsString()
  description!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpsertVariantDto {
  @ApiPropertyOptional({ description: 'Omit to create; set UUID to update' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Large' })
  @IsString()
  label!: string;

  @ApiProperty({ example: '650.00', description: 'PKR' })
  @IsString()
  price!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;
}
