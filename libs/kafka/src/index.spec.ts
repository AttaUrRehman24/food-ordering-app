import { KafkaTopics } from './index';

describe('KafkaTopics ( Documentation §5.1)', () => {
  it('includes order and identity topics', () => {
    expect(KafkaTopics.OrderCreated).toBe('order.created');
    expect(KafkaTopics.UserOtpRequested).toBe('user.otp.requested');
    expect(KafkaTopics.CatalogProductChanged).toBe('catalog.product.changed');
    expect(KafkaTopics.SessionRevoked).toBe('session.revoked');
  });
});
