import { describe, it, expect } from 'vitest';
import { generateScenario } from '../scenario';
import { pricingDaysFor, TRADING_DAYS } from '../calendar';

describe('scenario generator', () => {
  it('same seed -> identical scenario; different seed -> different', () => {
    expect(generateScenario(42)).toEqual(generateScenario(42));
    expect(generateScenario(42)).not.toEqual(generateScenario(43));
  });

  it('initial cargo is always the exercise brief', () => {
    for (const s of [1, 7, 42, 99]) {
      const c = generateScenario(s).initialCargo;
      expect(c.grade).toBe('Forties');
      expect(c.side).toBe('S');
      expect(c.volumeBbl).toBe(700_000);
      expect(c.diff).toBe(-0.10);
      expect(c.blDate).toBe('2024-04-05');
      expect(c.rule).toEqual({ kind: 'around', before: 2, after: 2 });
      expect(pricingDaysFor(c.blDate, c.rule)).toEqual(
        ['2024-04-03', '2024-04-04', '2024-04-05', '2024-04-08', '2024-04-09']);
    }
  });

  it('every scenario has >=1 buy and >=1 sell cargo, 14-22 news, >=2 manager messages', () => {
    for (const s of [1, 2, 3, 7, 13, 42, 77, 123, 555, 999]) {
      const sc = generateScenario(s);
      const cargoes = [
        { side: sc.initialCargo.side },
        ...sc.events.filter((e) => e.kind === 'newCargo').map((e) => e.cargo),
      ];
      expect(cargoes.filter((c) => c.side === 'B').length).toBeGreaterThanOrEqual(1);
      expect(cargoes.filter((c) => c.side === 'S').length).toBeGreaterThanOrEqual(1);
      const news = sc.events.filter((e) => e.kind === 'news');
      expect(news.length).toBeGreaterThanOrEqual(14);
      expect(news.length).toBeLessThanOrEqual(23); // 14-22 generated + welcome
      const mgr = sc.events.filter((e) => e.kind === 'message' && e.from === 'Trading Manager');
      expect(mgr.length).toBeGreaterThanOrEqual(2);
      // 3-5 additional cargoes
      const nc = sc.events.filter((e) => e.kind === 'newCargo');
      expect(nc.length).toBeGreaterThanOrEqual(3);
      expect(nc.length).toBeLessThanOrEqual(5);
      // 1-2 bl shifts referencing existing cargo ids
      const shifts = sc.events.filter((e) => e.kind === 'blShift');
      expect(shifts.length).toBeGreaterThanOrEqual(1);
      expect(shifts.length).toBeLessThanOrEqual(2);
    }
  });

  it('no cargo has a pricing day before its arrival day (seeds 1..50)', () => {
    for (let s = 1; s <= 50; s++) {
      const sc = generateScenario(s);
      for (const e of sc.events) {
        if (e.kind !== 'newCargo') continue;
        const arrival = TRADING_DAYS[e.day];
        for (const d of pricingDaysFor(e.cargo.blDate, e.cargo.rule)) {
          expect(d, `seed ${s} ${e.cargo.grade} pricing ${d} < arrival ${arrival}`)
            .toSatisfy((x: string) => x >= arrival);
        }
      }
    }
  });
});
