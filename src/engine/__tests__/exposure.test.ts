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

  it('show-selected filter aggregates only selected deals (physical counts only if selected)', () => {
    const e = new SimEngine({ seed: 1 });
    e.start();
    for (let t = 0; t < TICKS_PER_DAY * 4 + 20; t++) e.tick(); // one fixing: -140k
    const a = e.executeDeal('BRENT', 'MAY', 'B', 100);
    e.executeDeal('BRENT', 'JUN', 'B', 50);
    a.selected = true;
    // select only the futures deal -> physical fixings NOT counted (real sim quirk)
    const sel = e.deals.filter((d) => d.selected);
    expect(sel.some((d) => d.kind === 'physical')).toBe(false);
    const ex = e.exposure(sel);
    expect(ex.get('BRENT:MAY')).toBe(100_000);
    expect(ex.get('BRENT:JUN') ?? 0).toBe(0);
    // selecting the physical deal too -> its -140k reappears
    e.deals.find((d) => d.kind === 'physical')!.selected = true;
    const ex2 = e.exposure(e.deals.filter((d) => d.selected));
    expect(ex2.get('BRENT:MAY')).toBe(-40_000);
  });

  it('hedging profile shows forward plan: hedge required every day, net outright after hedges', () => {
    const e = new SimEngine({ seed: 1 });
    e.start();
    const profile = e.hedgingProfile();
    expect(profile).toHaveLength(5);
    for (const r of profile) {
      expect(r.pricingVolumeBbl).toBe(-140_000);
      expect(r.hedgeRequiredBbl).toBe(140_000); // plan ahead, even before fixing
    }
    expect(profile.every((r) => r.cumPricedExposureBbl === 0)).toBe(true);
    e.executeDeal('BRENT', 'MAY', 'B', 140);
    const p2 = e.hedgingProfile();
    expect(p2[0].hedgesBbl).toBe(140_000);
    expect(p2[0].netOutrightBbl).toBe(140_000); // hedges on, nothing priced yet
  });

  it('negative formatting uses brackets', () => {
    expect(fmtBbl(-140_000)).toBe('(140,000)');
    expect(fmtBbl(500_000)).toBe('500,000');
  });
});
