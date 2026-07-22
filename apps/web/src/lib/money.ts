/** Format amounts as Pakistani Rupees */
export function formatPkr(amount: string | number | null | undefined): string {
  const n = typeof amount === 'number' ? amount : Number(amount ?? 0);
  if (!Number.isFinite(n)) {
    return 'Rs 0';
  }
  return `Rs ${n.toLocaleString('en-PK', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
