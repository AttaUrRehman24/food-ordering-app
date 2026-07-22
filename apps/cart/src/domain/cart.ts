export interface CartItem {
  productId: string;
  variantId: string;
  label: string;
  unitPrice: string;
  quantity: number;
}

export interface CartDto {
  userId: string;
  items: CartItem[];
  total: string;
  itemCount: number;
}

export function itemKey(productId: string, variantId: string): string {
  return `${productId}:${variantId}`;
}

export function computeTotal(items: CartItem[]): string {
  const sum = items.reduce(
    (acc, item) => acc + Number(item.unitPrice) * item.quantity,
    0,
  );
  return sum.toFixed(2);
}

export function computeItemCount(items: CartItem[]): number {
  return items.reduce((acc, item) => acc + item.quantity, 0);
}

export function toCartDto(userId: string, items: CartItem[]): CartDto {
  return {
    userId,
    items,
    total: computeTotal(items),
    itemCount: computeItemCount(items),
  };
}
