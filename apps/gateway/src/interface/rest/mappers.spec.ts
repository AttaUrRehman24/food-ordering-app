import { mapAuthTokens, mapCart, mapProduct } from './mappers';

describe('Gateway REST mappers ( Documentation §16 / §23)', () => {
  it('maps auth tokens to camelCase public shape', () => {
    expect(
      mapAuthTokens({
        accessToken: 'a',
        refreshToken: 'r',
        user: {
          id: '1',
          name: 'A',
          email: 'a@b.c',
          phone: '+1',
          role: 'customer',
        },
      }),
    ).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: '1', name: 'A', email: 'a@b.c', phone: '+1', role: 'customer' },
    });
  });

  it('maps cart itemCount', () => {
    expect(
      mapCart({
        userId: 'u',
        items: [],
        total: '0',
        itemCount: 0,
      }),
    ).toEqual({ items: [], total: '0', itemCount: 0 });
  });

  it('maps product variants', () => {
    const p = mapProduct({
      id: 'p1',
      name: 'Wings',
      description: 'Crispy',
      isActive: true,
      imageUrl: '',
      variants: [
        { id: 'v1', productId: 'p1', label: '8pc', price: '12.99', isActive: true },
      ],
    });
    expect(p.imageUrl).toBeNull();
    expect(p.variants[0].price).toBe('12.99');
  });
});
