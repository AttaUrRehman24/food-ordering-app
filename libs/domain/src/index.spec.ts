import { OrderStatus, PaymentType, Role } from './index';

describe('domain enums ( Documentation §0 / §6 / §8)', () => {
  it('exposes exactly customer and admin roles', () => {
    expect(Object.values(Role).sort()).toEqual(['admin', 'customer']);
  });

  it('exposes order statuses pending|paid|failed|cancelled', () => {
    expect(Object.values(OrderStatus).sort()).toEqual([
      'cancelled',
      'failed',
      'paid',
      'pending',
    ]);
  });

  it('exposes payment types COD and Card', () => {
    expect(Object.values(PaymentType).sort()).toEqual(['COD', 'Card']);
  });
});
