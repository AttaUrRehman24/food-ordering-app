import { OrderStatus, PaymentType } from '@food-ordering/domain';

export interface OrderLineInput {
  variantId: string;
  productNameSnapshot: string;
  variantLabelSnapshot: string;
  unitPriceSnapshot: string;
  quantity: number;
}

export interface OrderDto {
  id: string;
  userId: string;
  total: string;
  paymentType: PaymentType;
  status: OrderStatus;
  createdAt: string;
  softDeleted: boolean;
  items: Array<{
    id: string;
    variantId: string;
    productNameSnapshot: string;
    variantLabelSnapshot: string;
    unitPriceSnapshot: string;
    quantity: number;
  }>;
  statusHistory: Array<{ id: string; status: OrderStatus; at: string }>;
}

export interface OrderSummaryDto {
  id: string;
  userId?: string;
  total: string;
  status: OrderStatus;
  paymentType: PaymentType;
  createdAt: string;
  itemCount: number;
}

export interface PlaceOrderResult {
  orderId: string;
  status: OrderStatus;
  total: string;
}
