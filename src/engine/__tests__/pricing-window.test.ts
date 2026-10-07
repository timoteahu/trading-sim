import { describe, it, expect } from 'vitest';
import { pricingWindow, businessDayOffset } from '../calendar';
import { PHYSICAL_PER_DAY_BBL, PHYSICAL_TOTAL_BBL } from '../sim';

describe('pricing window (2-1-2 around B/L)', () => {
  it('Fri 5 Apr -> [3,4,5,8,9]', () => {
    expect(pricingWindow('2024-04-05')).toEqual([
      '2024-04-03', '2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09',
    ]);
  });
  it('Mon 8 Apr -> [4,5,8,9,10] (skips weekend)', () => {
    expect(pricingWindow('2024-04-08')).toEqual([
      '2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09', '2024-04-10',
    ]);
  });
  it('businessDayOffset skips weekends', () => {
    expect(businessDayOffset('2024-04-05', 1)).toBe('2024-04-08');
    expect(businessDayOffset('2024-04-08', -2)).toBe('2024-04-04');
  });
  it('700kb over 5 days = 140kb/day', () => {
    expect(PHYSICAL_TOTAL_BBL / 5).toBe(140_000);
    expect(PHYSICAL_PER_DAY_BBL).toBe(140_000);
  });
});
