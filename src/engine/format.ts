/** Negative numbers in brackets: -140000 -> "(140,000)". */
export function fmtBbl(n: number): string {
  const abs = Math.abs(Math.round(n));
  const s = abs.toLocaleString('en-US');
  return n < 0 ? `(${s})` : s;
}
export function fmtUsd(n: number): string {
  const abs = Math.abs(Math.round(n));
  const s = abs.toLocaleString('en-US');
  return n < 0 ? `($${s})` : `$${s}`;
}
export function fmtPrice(n: number, dp = 2): string {
  return n.toFixed(dp);
}
