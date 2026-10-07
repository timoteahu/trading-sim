import { LOT_BBL, instrumentId } from './instruments';
import { TICKS_PER_DAY, type SimEngine } from './sim';

export interface HedgeDayRow {
  date: string;
  netOutrightBbl: number;
  hedged: boolean;
  slippageBbl: number;
}
export interface TimingRow {
  date: string;
  avgMinutesBeforeClose: number | null;
  earlyDeals: number;
  deals: number;
}
export interface Debrief {
  finished: boolean;
  tcm: number;
  hedging: { days: HedgeDayRow[]; score: number; avgAbsOvernightBbl: number };
  timing: { rows: TimingRow[]; avgMinutesBeforeClose: number | null; earlyCount: number; score: number };
  pov: { maxJunLots: number; breachCount: number; wrongContractDays: number; score: number };
  stopLoss: { breached: boolean; flattenedInTime: boolean | null; informedCR: boolean | null; score: number };
  comms: { expected: number; answered: number; score: number };
  bestDay: { date: string; pnl: number } | null;
  worstDay: { date: string; pnl: number } | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  gradeScore: number;
}

const gradeOf = (s: number): Debrief['grade'] =>
  s >= 0.9 ? 'A' : s >= 0.8 ? 'B' : s >= 0.7 ? 'C' : s >= 0.55 ? 'D' : 'F';

/** Days on which at least one cargo fixed. */
export function pricingDates(e: SimEngine): Set<string> {
  const s = new Set<string>();
  for (const c of e.physicals) for (const f of c.fixings) s.add(f.date);
  return s;
}

/** Cumulative signed physical bbl priced through `date` (inclusive). */
export function cumPricedAt(e: SimEngine, date: string): number {
  let t = 0;
  for (const c of e.physicals) {
    const s = c.side === 'S' ? -1 : 1;
    for (const f of c.fixings) if (f.date <= date) t += s * f.volumeBbl;
  }
  return t;
}

export function scoreRun(e: SimEngine): Debrief {
  // --- hedging ---
  const pDates = pricingDates(e);
  const hedgeDays: HedgeDayRow[] = [];
  for (const dc of e.dayCloses) {
    if (!pDates.has(dc.date)) continue;
    const hedged = Math.abs(dc.netOutrightBbl) < LOT_BBL;
    hedgeDays.push({
      date: dc.date, netOutrightBbl: dc.netOutrightBbl, hedged,
      slippageBbl: hedged ? 0 : Math.abs(dc.netOutrightBbl),
    });
  }
  const hedgingScore = hedgeDays.length ? hedgeDays.filter((d) => d.hedged).length / hedgeDays.length : 1;
  const avgAbsOvernight = e.dayCloses.length
    ? e.dayCloses.reduce((a, d) => a + Math.abs(d.netOutrightBbl), 0) / e.dayCloses.length : 0;

  // --- timing: MAY futures deals on pricing days, minutes before close ---
  const timingRows: TimingRow[] = [];
  let earlyCount = 0;
  const mayDeals = e.deals.filter((d) => d.kind === 'future' && d.contract === 'MAY' && d.product === 'BRENT');
  for (const date of [...pDates].sort()) {
    const ds = mayDeals.filter((d) => d.day === date);
    const mins = ds.map((d) => TICKS_PER_DAY - d.tickOfDay);
    const early = ds.filter((d) => d.tickOfDay < 240).length;
    earlyCount += early;
    timingRows.push({
      date, deals: ds.length,
      avgMinutesBeforeClose: mins.length ? mins.reduce((a, b) => a + b) / mins.length : null,
      earlyDeals: early,
    });
  }
  const allMins = timingRows.flatMap((r) => (r.avgMinutesBeforeClose == null ? [] : [r.avgMinutesBeforeClose]));
  const avgMin = allMins.length ? allMins.reduce((a, b) => a + b) / allMins.length : null;
  // score: full marks if avg hedge within last 60 min and no early deals
  let timingScore = 1;
  if (avgMin != null) timingScore *= Math.max(0, Math.min(1, 1.5 - avgMin / 60));
  if (earlyCount > 0) timingScore *= Math.max(0, 1 - earlyCount * 0.15);

  // --- POV / limits ---
  const mayId = instrumentId('BRENT', 'MAY');
  let wrongContractDays = 0;
  for (const dc of e.dayCloses) {
    if (pDates.has(dc.date)) continue; // only flag non-pricing days
    const target = -cumPricedAt(e, dc.date);
    // reconstruct MAY position at that close? approximation: current deals up to that day
    const dayIdx = e.dayCloses.indexOf(dc);
    const mayLots = e.deals
      .filter((d) => d.kind === 'future' && d.contract === 'MAY' && d.product === 'BRENT')
      .filter((d) => TRADING_DAY_INDEX(d.day) <= dayIdx)
      .reduce((a, d) => a + (d.bs === 'B' ? 1 : -1) * d.quantityLots, 0) * LOT_BBL;
    if (Math.abs(mayLots - target) > LOT_BBL) wrongContractDays++;
  }
  void mayId;
  let povScore = 1;
  if (e.junBreachCount > 0) povScore -= Math.min(0.5, e.junBreachCount * 0.15);
  povScore -= Math.min(0.4, wrongContractDays * 0.1);

  // --- stop loss compliance ---
  let flattened: boolean | null = null, informed: boolean | null = null;
  if (e.stopLossHit) {
    flattened = e.povFlattenTick >= 0 && e.povFlattenTick - e.stopLossTick <= 60;
    informed = e.messages.some((m) => m.mine && m.thread === 'Control Room' &&
      m.gtick > e.stopLossTick && m.gtick <= e.stopLossTick + 60);
  }
  const stopScore = !e.stopLossHit ? 1
    : (flattened ? 0.5 : 0) + (informed ? 0.5 : 0);

  // --- comms ---
  const expected = e.messages.filter((m) => m.expectsReply);
  const answered = expected.filter((req) =>
    e.messages.some((m) => m.mine && m.thread === req.thread &&
      m.gtick > req.gtick && m.gtick <= req.gtick + 90));
  const commsScore = expected.length ? answered.length / expected.length : 1;

  // --- days ---
  let best: Debrief['bestDay'] = null, worst: Debrief['worstDay'] = null;
  for (let i = 0; i < e.dayCloses.length; i++) {
    const pnl = e.dayCloses[i].pnl - (i ? e.dayCloses[i - 1].pnl : 0);
    const row = { date: e.dayCloses[i].date, pnl };
    if (!best || pnl > best.pnl) best = row;
    if (!worst || pnl < worst.pnl) worst = row;
  }

  const compliance = (povScore + stopScore) / 2;
  const gradeScore =
    0.5 * hedgingScore + 0.2 * commsScore + 0.2 * compliance + 0.1 * timingScore;

  return {
    finished: e.status === 'finished',
    tcm: e.totalPnl(),
    hedging: { days: hedgeDays, score: hedgingScore, avgAbsOvernightBbl: avgAbsOvernight },
    timing: { rows: timingRows, avgMinutesBeforeClose: avgMin, earlyCount, score: timingScore },
    pov: { maxJunLots: e.maxJunQty, breachCount: e.junBreachCount, wrongContractDays, score: povScore },
    stopLoss: { breached: e.stopLossHit, flattenedInTime: flattened, informedCR: informed, score: stopScore },
    comms: { expected: expected.length, answered: answered.length, score: commsScore },
    bestDay: best, worstDay: worst,
    grade: gradeOf(gradeScore), gradeScore,
  };
}

import { TRADING_DAYS } from './calendar';
function TRADING_DAY_INDEX(iso: string) { return TRADING_DAYS.indexOf(iso); }
