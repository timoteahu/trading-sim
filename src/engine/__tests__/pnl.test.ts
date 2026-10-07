import { describe, it, expect } from 'vitest';
import { SimEngine, STOP_LOSS } from '../sim';
import { LOT_BBL } from '../instruments';
import { quietEngine } from './pricing-window.test';
import type { CargoSpec } from '../types';

const FORTIES: CargoSpec = {
  grade: 'Forties', side: 'S', volumeBbl: 700_000, diff: -0.10,
  blDate: '2024-04-05', rule: { kind: 'around', before: 2, after: 2 },
};
const EKOFISK_BUY: CargoSpec = {
  grade: 'Ekofisk', side: 'B', volumeBbl: 500_000, diff: 0.35,
  blDate: '2024-04-01', rule: { kind: 'after', days: 5 },
};

describe('pnl', () => {
  it('futures unrealised P&L vs mid', () => {
    const e = quietEngine(FORTIES, 3);
    e.start();
    e.tick();
    const q = e.quote('BRENT', 'MAY');
    e.executeDeal('BRENT', 'MAY', 'B', 10);
    expect(e.futuresPnl()).toBeCloseTo(10 * LOT_BBL * (q.mid - q.ask), 4);
  });

  it('physical MTM: sold (close - cur) * vol; bought (cur - close) * vol; diff cancels', () => {
    const e = quietEngine(FORTIES, 3);
    e.addCargo(EKOFISK_BUY);
    e.start();
    let guard = 0;
    while (e.dayIndex <= 2 && guard++ < 20_000) e.tick(); // end of Apr 3
    const cur = e.mid('BRENT:MAY');
    const sold = e.physicals[0].fixings[0];            // -140k tranche
    const bought = e.physicals[1].fixings;             // +100k x2 (Apr 2, 3)
    const soldClose = sold.fixedPrice - e.physicals[0].diff;
    const expected =
      (soldClose - cur) * sold.volumeBbl +
      bought.reduce((a, f) => a + (cur - (f.fixedPrice - e.physicals[1].diff)) * f.volumeBbl, 0);
    expect(e.physicalPnl()).toBeCloseTo(expected, 4);
  });

  it('stop loss triggers at <= -$1,000,000', () => {
    const e = quietEngine(FORTIES, 3);
    e.start();
    e.tick();
    e.executeDeal('BRENT', 'MAY', 'B', 500);
    for (const [id, m] of e.mids) e.mids.set(id, m * 0.9);
    e.tick();
    expect(e.totalPnl()).toBeLessThanOrEqual(STOP_LOSS);
    expect(e.stopLossHit).toBe(true);
    expect(e.stopLossTick).toBeGreaterThan(0);
    expect(e.news.some((n) => n.headline === 'STOP LOSS BREACHED')).toBe(true);
  });
});
