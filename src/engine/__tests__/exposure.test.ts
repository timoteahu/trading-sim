import { describe, it, expect } from 'vitest';
import { SimEngine, TICKS_PER_DAY } from '../sim';
import { fmtBbl } from '../format';

describe('exposure', () => {
  it('first pricing-day fixing (Thu 4 Apr after B/L shift) with no hedge -> outright -140,000 Brent MAY', () => {
    const e = new SimEngine({ seed: 1 });
    e.start();
    // B/L slips on day 3, so first pricing day is Thu 4 Apr (day index 3)
    for (let t = 0; t < TICKS_PER_DAY * 4 + 20; t++) e.tick();
    expect(e.physical.fixings.map((f) => f.date)).toEqual(['2024-04-04']);
    expect(e.exposure().get('BRENT:MAY')).toBe(-140_000);
    expect(e.totalExposureBbl()).toBe(-140_000);
  });

  it('buying 140 lots MAY Brent nets exposure to 0', () => {
    const e = new SimEngine({ seed: 1 });
    e.start();
    for (let t = 0; t < TICKS_PER_DAY * 4 + 20; t++) e.tick();
    e.executeDeal('BRENT', 'MAY', 'B', 140);
    expect(e.exposure().get('BRENT:MAY')).toBe(0);
  });

  it('show-selected filter aggregates only selected deals', () => {
    const e = new SimEngine({ seed: 1 });
    e.start();
    for (let t = 0; t < 5; t++) e.tick();
    const a = e.executeDeal('BRENT', 'MAY', 'B', 100);
    const b = e.executeDeal('BRENT', 'JUN', 'B', 50);
    a.selected = true;
    const sel = e.deals.filter((d) => d.selected && d.kind !== 'physical');
    const ex = e.exposure([...sel, ...e.deals.filter((d) => d.kind === 'physical')]);
    expect(ex.get('BRENT:MAY')).toBe(100_000);
    expect(ex.get('BRENT:JUN') ?? 0).toBe(0);
    void b;
  });

  it('negative formatting uses brackets', () => {
    expect(fmtBbl(-140_000)).toBe('(140,000)');
    expect(fmtBbl(500_000)).toBe('500,000');
  });
});
