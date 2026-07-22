import { PaymentType } from '@food-ordering/domain';
import type { PaymentProvider, PaymentResult } from '../../application/ports';

/** TDR-6 — pluggable PaymentProvider; COD auto-paid; Card mock */
export class CodPaymentProvider implements PaymentProvider {
  async charge(input: {
    orderId: string;
    userId: string;
    total: string;
    paymentType: PaymentType;
  }): Promise<PaymentResult> {
    if (input.paymentType === PaymentType.Cod) {
      return { orderId: input.orderId, status: 'paid' };
    }
    // Card mock — succeeds unless total ends with .13 (test failure hook)
    if (input.total.endsWith('.13')) {
      return { orderId: input.orderId, status: 'failed' };
    }
    return { orderId: input.orderId, status: 'paid' };
  }
}
