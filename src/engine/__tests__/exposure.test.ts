import { describe, it, expect } from 'vitest';
import { SimEngine } from '../sim';
import { fmtBbl } from '../format';
import type { CargoSpec } from '../types';
import { quietEngine } from './pricing-window.test';

const FORTIES: CargoSpec = {
  grade: 'Forties', side: 'S', volumeBbl: 700_000, diff: -0.10,
  blDate: '2024-04-05', rule: { kind: 'around', before: 2, after: 2 },
};

/** run until end of day index d (inclusive of its close -> dayIndex advances) */
function runThroughDay(e: SimEngine, d: number) {
  let guard = 0;
  while (e.dayIndex <= d && e.status !== 'finished' && guard++ < 50_000) e.tick();
}

describe('exposure (multi-cargo)', () => {
  it('sold Forties 2-1-2 fixes -140,000/day; first pricing day 3 Apr', () => {
    const e = quietEngine(FORTIES);
    e.start();
    runThroughDay(e, 2);
    const c = e.physicals[0];
    expect(c.fixings.map((f) => f.date)).toEqual(['2024-04-03']);
    expect(c.fixings[0].volumeBbl).toBe(140_000);
    expect(e.exposure().get('BRENT:MAY')).toBe(-140_000);
  });

  it('sold Forties + bought Ekofisk 5-after: shared pricing day nets -40,000 -> Buy 40 lots', () => {
    const e = quietEngine(FORTIES);
    e.addCargo({
      grade: 'Ekofisk', side: 'B', volumeBbl: 500_000, diff: 0.35,
      blDate: '2024-04-01', rule: { kind: 'after', days: 5 }, // prices 2,3,4,5,8 Apr
    });
    e.start();
    runThroughDay(e, 2); // end of Wed 3 Apr: both priced today
    expect(e.physicals[0].fixings.length).toBe(1);   // -140k
    expect(e.physicals[1].fixings.length).toBe(2);   // Apr 2 + Apr 3, +100k each
    const may = e.exposure().get('BRENT:MAY')!;
    expect(may).toBe(-140_000 + 200_000); // Ekofisk fixed twice by Apr 3
    // hedge required on a shared pricing day
    const row = e.hedgingProfile().find((r) => r.date === '2024-04-04')!;
    expect(row.pricingNetBbl).toBe(-140_000 + 100_000);
    expect(row.hedgeRequiredLots).toBe(40);
  });

  it('buying 140 lots MAY Brent nets the single-cargo exposure to 0', () => {
    const e = quietEngine(FORTIES);
    e.start();
    runThroughDay(e, 2);
    e.executeDeal('BRENT', 'MAY', 'B', 140);
    expect(e.exposure().get('BRENT:MAY')).toBe(0);
  });

  it('show-selected: physical counts only when the physical deal is selected', () => {
    const e = quietEngine(FORTIES);
    e.start();
    runThroughDay(e, 2);
    const a = e.executeDeal('BRENT', 'MAY', 'B', 100);
    a.selected = true;
    const sel = e.deals.filter((d) => d.selected);
    expect(e.exposure(sel).get('BRENT:MAY')).toBe(100_000);
    e.deals.find((d) => d.kind === 'physical')!.selected = true;
    expect(e.exposure(e.deals.filter((d) => d.selected)).get('BRENT:MAY')).toBe(-40_000);
  });

  it('hedging profile lists every business day forward with signed hedge requirement', () => {
    const e = quietEngine(FORTIES);
    e.start();
    const profile = e.hedgingProfile();
    const pricingRows = profile.filter((r) => r.byCargo.length > 0);
    expect(pricingRows.map((r) => r.date)).toEqual(
      ['2024-04-03', '2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09']);
    for (const r of pricingRows) {
      expect(r.pricingNetBbl).toBe(-140_000);
      expect(r.hedgeRequiredLots).toBe(140);
    }
    // non-pricing business days appear too
    expect(profile[0].date).toBe('2024-04-01');
    expect(profile[0].byCargo).toHaveLength(0);
    expect(profile[0].hedgeRequiredLots).toBe(0);
  });

  it('negative formatting uses brackets', () => {
    expect(fmtBbl(-140_000)).toBe('(140,000)');
  });
});
