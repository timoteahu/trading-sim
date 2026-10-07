import { describe, it, expect } from 'vitest';
import { SimEngine, TICKS_PER_DAY } from '../sim';
import { quietEngine } from './pricing-window.test';
import type { CargoSpec } from '../types';

const FORTIES: CargoSpec = {
  grade: 'Forties', side: 'S', volumeBbl: 700_000, diff: -0.10,
  blDate: '2024-04-05', rule: { kind: 'around', before: 2, after: 2 },
};

describe('clock & day roll', () => {
  it('6 min/day = 360 ticks; roll records close and resets Change basis', () => {
    const e = quietEngine(FORTIES, 9);
    e.start();
    for (let t = 0; t < TICKS_PER_DAY; t++) e.tick();
    expect(e.status).toBe('paused');
    expect(e.dayIndex).toBe(1);
    expect(e.prevClose.get('BRENT:MAY')!).toBeGreaterThan(0);
    expect(Math.abs(e.changeOf('BRENT', 'MAY').diff)).toBeLessThan(0.03);
    for (let t = 0; t < 4; t++) e.tick();
    expect(e.status).toBe('open');
  });

  it('10 days -> finished; all 5 fixings made; dayCloses recorded', () => {
    const e = quietEngine(FORTIES, 9);
    e.start();
    let guard = 0;
    while (e.status !== 'finished' && guard++ < 50_000) e.tick();
    expect(e.status).toBe('finished');
    expect(e.dayIndex).toBe(9);
    expect(e.physicals[0].fixings.map((f) => f.date)).toEqual(
      ['2024-04-03', '2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09']);
    expect(e.dayCloses).toHaveLength(10);
    expect(e.news.some((n) => n.headline.includes('final summary'))).toBe(true);
  });

  it('B/L shift event mutates pricing window, drops out-of-window fixings, updates deal', () => {
    const e = new SimEngine({
      seed: 9,
      scenario: {
        seed: 9, driftPerTick: 0, volScale: 1, initialCargo: FORTIES,
        events: [{ day: 0, tick: 20, kind: 'blShift', cargoId: 0, newBl: '2024-04-08' }],
      },
    });
    e.start();
    // artificially fix Wed 3 Apr and hedge it
    e.physicals[0].fixings.push({ date: '2024-04-03', volumeBbl: 140_000, fixedPrice: 85 });
    e.executeDeal('BRENT', 'MAY', 'B', 140);
    expect(e.exposure().get('BRENT:MAY')).toBe(0);
    for (let t = 0; t < 25; t++) e.tick();
    const c = e.physicals[0];
    expect(c.blDate).toBe('2024-04-08');
    expect(c.pricingDays).toEqual(
      ['2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09', '2024-04-10']);
    expect(c.fixings).toHaveLength(0);           // 3 Apr left the window
    expect(e.exposure().get('BRENT:MAY')).toBe(140_000); // over-hedged
    const deal = e.deals.find((d) => d.kind === 'physical')!;
    expect(deal.priceFrm).toBe('4 APR');
    expect(deal.priceTo).toBe('10 APR');
    expect(e.news.some((n) => n.headline.includes('B/L revised'))).toBe(true);
    expect(e.messages.some((m) => m.from === 'Operations')).toBe(true);
  });
});
