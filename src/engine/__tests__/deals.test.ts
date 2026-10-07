import { describe, it, expect } from 'vitest';
import { SimEngine } from '../sim';
import { LOT_BBL } from '../instruments';

describe('deal execution', () => {
  it('buy fills at ask, sell fills at bid', () => {
    const e = new SimEngine({ seed: 7 });
    e.start();
    e.tick();
    const q = e.quote('BRENT', 'MAY');
    const buy = e.executeDeal('BRENT', 'MAY', 'B', 10);
    expect(buy.priceDiff).toBeCloseTo(q.ask, 6);
    const q2 = e.quote('BRENT', 'MAY');
    const sell = e.executeDeal('BRENT', 'MAY', 'S', 10);
    expect(sell.priceDiff).toBeCloseTo(q2.bid, 6);
  });

  it('fill uses price at submit time, not ticket-open time', () => {
    const e = new SimEngine({ seed: 7 });
    e.start();
    e.tick();
    const openAsk = e.quote('BRENT', 'MAY').ask; // ticket opened here
    for (let i = 0; i < 50; i++) e.tick();       // market moves while ticket open
    const submitAsk = e.quote('BRENT', 'MAY').ask;
    const d = e.executeDeal('BRENT', 'MAY', 'B', 5);
    expect(d.priceDiff).toBeCloseTo(submitAsk, 6);
    expect(d.priceDiff).not.toBeCloseTo(openAsk, 6);
  });

  it('1 lot = 1,000 bbl; flipping long 500 via sell 1000 -> short 500', () => {
    const e = new SimEngine({ seed: 7 });
    e.start();
    e.tick();
    e.executeDeal('BRENT', 'MAY', 'B', 500);
    e.executeDeal('BRENT', 'MAY', 'S', 1000);
    const pos = e.positions.get('BRENT:MAY')!;
    expect(pos.qty).toBe(-500);
    expect(e.exposure().get('BRENT:MAY')).toBe(-500 * LOT_BBL);
    // bought at ask, sold at bid -> realized carry loss on the closed 500 lots
    expect(pos.realized).toBeLessThan(0);
  });
});
