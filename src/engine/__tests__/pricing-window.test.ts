import { describe, it, expect } from 'vitest';
import { pricingDaysFor, pricingWindow, businessDayOffset } from '../calendar';
import { SimEngine } from '../sim';
import type { Scenario } from '../types';

export const QUIET: Omit<Scenario, 'initialCargo'> = {
  seed: 1, events: [], driftPerTick: 0, volScale: 1,
};

export function quietEngine(cargo: Scenario['initialCargo'], seed = 1) {
  return new SimEngine({ seed, scenario: { ...QUIET, initialCargo: cargo } });
}

describe('pricingDaysFor', () => {
  it('around 2-1-2: Fri 5 Apr -> [3,4,5,8,9]; Mon 8 Apr -> [4,5,8,9,10]', () => {
    expect(pricingDaysFor('2024-04-05', { kind: 'around', before: 2, after: 2 }))
      .toEqual(['2024-04-03', '2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09']);
    expect(pricingDaysFor('2024-04-08', { kind: 'around', before: 2, after: 2 }))
      .toEqual(['2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09', '2024-04-10']);
  });
  it('pricingWindow kept as 2-1-2', () => {
    expect(pricingWindow('2024-04-05')).toEqual(
      pricingDaysFor('2024-04-05', { kind: 'around', before: 2, after: 2 }));
  });
  it('after N days: B/L excluded, weekends skipped', () => {
    // Fri 5 Apr -> next 5 business days = 8,9,10,11,12
    expect(pricingDaysFor('2024-04-05', { kind: 'after', days: 5 }))
      .toEqual(['2024-04-08', '2024-04-09', '2024-04-10', '2024-04-11', '2024-04-12']);
  });
  it('before N days: B/L excluded, weekends skipped', () => {
    // Tue 9 Apr -> previous 3 business days = 4,5,8
    expect(pricingDaysFor('2024-04-09', { kind: 'before', days: 3 }))
      .toEqual(['2024-04-04', '2024-04-05', '2024-04-08']);
  });
  it('3-0-3 around Mon 8 Apr', () => {
    expect(pricingDaysFor('2024-04-08', { kind: 'around', before: 3, after: 3 }))
      .toEqual(['2024-04-03', '2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09',
        '2024-04-10', '2024-04-11']);
  });
  it('businessDayOffset skips weekends', () => {
    expect(businessDayOffset('2024-04-05', 1)).toBe('2024-04-08');
    expect(businessDayOffset('2024-04-08', -2)).toBe('2024-04-04');
  });
});
