import { describe, it, expect } from 'vitest';
import { SimEngine, TICKS_PER_DAY } from '../sim';
import { scoreRun } from '../score';
import { TRADING_DAYS } from '../calendar';

/** signed physical exposure after today's close = fixings so far + today's imminent tranches */
function exposureAfterToday(e: SimEngine, today: string): number {
  let t = 0;
  for (const c of e.physicals) {
    const s = c.side === 'S' ? -1 : 1;
    for (const f of c.fixings) t += s * f.volumeBbl;
    if (c.pricingDays.includes(today) && !c.fixings.some((f) => f.date === today)) {
      t += s * e.perDayBbl(c, today);
    }
  }
  return t;
}

/** Perfect-hedger bot: holds a 50-lot JUN POV throughout; at tick 350 of each day,
 *  trades MAY to flatten today's expected physical exposure. */
function runBot(seed: number, play: boolean) {
  const e = new SimEngine({ seed });
  e.start();
  if (play) e.executeDeal('BRENT', 'JUN', 'B', 50); // allowed POV — must not break hedging score
  let guard = 0;
  while (e.status !== 'finished' && guard++ < 50_000) {
    if (play && e.status === 'open') {
      // answer manager messages promptly (within the 90-tick window)
      for (const req of e.messages.filter((m) => m.expectsReply)) {
        const answered = e.messages.some((m) => m.mine && m.thread === req.thread && m.gtick > req.gtick);
        if (!answered) e.sendMessage(req.thread, 'Exposure and TCM sent — all hedged.');
      }
      if (e.tickOfDay === TICKS_PER_DAY - 10) {
        const today = TRADING_DAYS[e.dayIndex];
        const targetBbl = -exposureAfterToday(e, today);
        const curBbl = e.mayFuturesBbl();
        const lots = Math.round((targetBbl - curBbl) / 1000);
        if (lots !== 0) {
          e.executeDeal('BRENT', 'MAY', lots > 0 ? 'B' : 'S', Math.abs(lots));
        }
      }
    }
    e.tick();
  }
  return e;
}

describe('debrief scoring', () => {
  it('perfect hedger: hedging score 1.0 and grade A/B', () => {
    const e = runBot(7, true);
    const d = scoreRun(e);
    expect(d.finished).toBe(true);
    expect(d.hedging.score).toBe(1.0);
    expect(d.comms.answered).toBe(d.comms.expected);
    expect(['A', 'B']).toContain(d.grade);
  });

  it('do-nothing run: pricing days unhedged, grade D/F', () => {
    const e = runBot(7, false);
    const d = scoreRun(e);
    expect(d.hedging.days.length).toBeGreaterThan(0);
    expect(d.hedging.score).toBe(0);
    expect(d.comms.answered).toBe(0);
    expect(['D', 'F']).toContain(d.grade);
  });
});
