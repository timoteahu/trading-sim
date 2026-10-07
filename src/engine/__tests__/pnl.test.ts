import { describe, it, expect } from 'vitest';
import { SimEngine, TICKS_PER_DAY, STOP_LOSS } from '../sim';
import { LOT_BBL } from '../instruments';

describe('pnl', () => {
  it('futures unrealised P&L vs mid', () => {
    const e = new SimEngine({ seed: 3 });
    e.start();
    e.tick();
    const q = e.quote('BRENT', 'MAY');
    e.executeDeal('BRENT', 'MAY', 'B', 10);
    const pnl = e.futuresPnl();
    // long 10 @ ask; unrealised = qty*1000*(mid-avg) = 10*1000*(-halfSpread)
    expect(pnl).toBeCloseTo(10 * LOT_BBL * (q.mid - q.ask), 4);
  });

  it('physical MTM: (fixedPrice - currentMid) * 140,000 per fixed day', () => {
    const e = new SimEngine({ seed: 3 });
    e.start();
    for (let t = 0; t < TICKS_PER_DAY * 4 + 20; t++) e.tick(); // first fix Thu 4 Apr
    const f = e.physical.fixings[0];
    const cur = e.mid('BRENT:MAY');
    expect(e.physicalPnl()).toBeCloseTo((f.fixedPrice - cur) * 140_000, 4);
  });

  it('stop loss triggers at <= -$1,000,000', () => {
    const e = new SimEngine({ seed: 3 });
    e.start();
    e.tick();
    // force a large loss: buy then crash the market
    e.executeDeal('BRENT', 'MAY', 'B', 500);
    for (const [id, m] of e.mids) e.mids.set(id, m * 0.9);
    e.tick();
    expect(e.totalPnl()).toBeLessThanOrEqual(STOP_LOSS);
    expect(e.stopLossHit).toBe(true);
    expect(e.news.some((n) => n.headline === 'STOP LOSS BREACHED')).toBe(true);
  });
});
