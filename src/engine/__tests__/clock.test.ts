import { describe, it, expect } from 'vitest';
import { SimEngine, TICKS_PER_DAY } from '../sim';

describe('clock & day roll', () => {
  it('6 min/day = 360 ticks; roll records close and resets Change basis', () => {
    const e = new SimEngine({ seed: 9 });
    e.start();
    for (let t = 0; t < TICKS_PER_DAY; t++) e.tick();
    // day ended -> paused roll in progress, dayIndex advanced
    expect(e.status).toBe('paused');
    expect(e.dayIndex).toBe(1);
    const close = e.prevClose.get('BRENT:MAY')!;
    // during roll, lasts are yesterday's -> change ~0
    expect(Math.abs(e.changeOf('BRENT', 'MAY').diff)).toBeLessThan(0.03);
    expect(close).toBeGreaterThan(0);
    // roll finishes -> open
    for (let t = 0; t < 4; t++) e.tick();
    expect(e.status).toBe('open');
  });

  it('10 days -> finished', () => {
    const e = new SimEngine({ seed: 9 });
    e.start();
    let guard = 0;
    while (e.status !== 'finished' && guard++ < 5000) e.tick();
    expect(e.status).toBe('finished');
    expect(e.dayIndex).toBe(9);
    // all 5 original pricing days fixed (day 3 fixing happened before shift)
    expect(e.physical.fixings.length).toBe(5);
    expect(e.news.some((n) => n.headline.includes('final summary'))).toBe(true);
  });

  it('B/L shift event mutates pricing window and physical deal dates', () => {
    const e = new SimEngine({ seed: 9 });
    e.start();
    // run through day 3 (index 2) where the shift fires at tick 30
    for (let t = 0; t < TICKS_PER_DAY * 2 + 60; t++) e.tick();
    expect(e.physical.blDate).toBe('2024-04-08');
    expect(e.physical.pricingDays).toEqual([
      '2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09', '2024-04-10',
    ]);
    const phys = e.deals.find((d) => d.kind === 'physical')!;
    expect(phys.priceFrm).toBe('4 APR');
    expect(phys.priceTo).toBe('10 APR');
  });
});
