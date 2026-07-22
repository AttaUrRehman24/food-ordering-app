import { orderChannel, presenceKey } from './presence-pubsub';

describe('Realtime Redis keys ( Documentation §7 / §10)', () => {
  it('builds presence and order channel keys', () => {
    expect(presenceKey('u1')).toBe('ws:presence:u1');
    expect(orderChannel('u1')).toBe('channel:order:u1');
  });
});
