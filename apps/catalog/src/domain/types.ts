export interface VariantDto {
  id: string;
  productId: string;
  label: string;
  price: string;
  isActive: boolean;
}

export interface ProductDto {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  imageUrl: string | null;
  variants: VariantDto[];
}

export interface VariantInput {
  label: string;
  price: string;
  isActive?: boolean;
}

export interface CreateProductInput {
  name: string;
  description: string;
  isActive?: boolean;
  imageUrl?: string | null;
  variants: VariantInput[];
}

export interface UpdateProductInput {
  id: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  imageUrl?: string | null;
}
