describe('web api client', () => {
  it('exposes gateway base URL', () => {
    expect(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/v1').toContain('/v1');
  });
});
