import { createRng } from './rng';
import { TRADING_DAYS, businessDayOffset, pricingDaysFor } from './calendar';
import type { CargoSpec, ScheduledEvent, Scenario } from './types';

// ---- news template pool (>=30) ----
interface NewsTpl { headline: string; body: string; min: number; max: number } // jump pct range; 0 = noise
const NEWS_POOL: NewsTpl[] = [
  { headline: 'OPEC+ signals discipline on quotas ahead of June meeting', body: 'Delegates say compliance with output quotas is improving.', min: 0.005, max: 0.012 },
  { headline: 'OPEC member presses for higher quota', body: 'One producer lobbies for a larger allocation; traders pare length.', min: -0.018, max: -0.008 },
  { headline: 'OPEC+ denies quota increase rumours', body: 'Spokesperson says no quota changes are on the table.', min: 0.010, max: 0.020 },
  { headline: 'OPEC ministers to meet early', body: 'An early ministerial meeting is announced.', min: 0.006, max: 0.014 },
  { headline: 'OPEC compliance slips, say trackers', body: 'Tanker tracking suggests overproduction vs quotas.', min: -0.014, max: -0.006 },
  { headline: 'Saudi Arabia trims OSP to Asia', body: 'Lower official selling prices read as soft demand signal.', min: -0.012, max: -0.005 },
  { headline: 'Weekly US inventory report: crude draws', body: 'EIA shows a larger-than-expected crude draw; products mixed.', min: 0.008, max: 0.016 },
  { headline: 'Weekly US inventory report: surprise build', body: 'EIA reports an unexpected crude stock build.', min: -0.016, max: -0.007 },
  { headline: 'Gasoline stocks fall as driving season nears', body: 'Product draws support the complex.', min: 0.004, max: 0.010 },
  { headline: 'Distillate inventories build on weak demand', body: 'Gasoil cracks ease on the print.', min: -0.010, max: -0.004 },
  { headline: 'Middle East tensions raise supply-risk premium', body: 'Regional escalation lifts the geopolitical premium.', min: 0.010, max: 0.020 },
  { headline: 'Ceasefire talks resume; risk premium fades', body: 'Reports of progress pressure crude.', min: -0.016, max: -0.008 },
  { headline: 'Houthi attacks disrupt Red Sea shipping', body: 'Tanker diversions tighten prompt supply chains.', min: 0.006, max: 0.014 },
  { headline: 'Forties pipeline outage reported', body: 'Unplanned outage on the Forties Pipeline System.', min: 0.008, max: 0.016 },
  { headline: 'Forties pipeline returns to normal operations', body: 'FPS restart confirmed; premium unwinds.', min: -0.012, max: -0.006 },
  { headline: 'North Sea loading programme steady', body: 'Forties programme for May published; in line with expectations.', min: 0, max: 0 },
  { headline: 'Ekofisk field maintenance extended', body: 'Maintenance extended by a week; cargo delays likely.', min: 0.004, max: 0.010 },
  { headline: 'Oseberg loading delays reported', body: 'Weather slows loadings at Sture.', min: 0.003, max: 0.008 },
  { headline: 'European refinery margins soften', body: 'Gasoil cracks ease as run rates stay high.', min: -0.008, max: -0.003 },
  { headline: 'Major refinery outage in ARA', body: 'Unplanned CDU shutdown tightens products.', min: 0.004, max: 0.010 },
  { headline: 'US dollar strengthens on hawkish Fed comments', body: 'DXY rallies; commodities offered.', min: -0.010, max: -0.004 },
  { headline: 'Dollar slides after soft US jobs data', body: 'Rate-cut bets lift commodities.', min: 0.005, max: 0.012 },
  { headline: 'China stimulus rumours lift demand hopes', body: 'Beijing reportedly weighing fresh stimulus.', min: 0.006, max: 0.014 },
  { headline: 'Chinese refinery runs disappoint', body: 'Teapots cut runs on poor margins.', min: -0.012, max: -0.005 },
  { headline: 'Spec length in Brent climbs to multi-month high', body: 'Positioning data show funds adding length.', min: 0, max: 0 },
  { headline: 'CTAs seen sellers below $84 Brent', body: 'Trend models flip short under key level.', min: -0.006, max: -0.002 },
  { headline: 'VLCC freight rates firm on Atlantic demand', body: 'Tanker market tightens for long-haul crude.', min: 0.002, max: 0.006 },
  { headline: 'Freight: North Sea Aframax rates slip', body: 'Prompt tonnage weighs on rates.', min: 0, max: 0 },
  { headline: 'IEA trims demand growth forecast', body: 'Agency cites efficiency gains and EV uptake.', min: -0.012, max: -0.006 },
  { headline: 'IEA raises supply growth estimate', body: 'Non-OPEC output seen beating forecasts.', min: -0.010, max: -0.005 },
  { headline: 'US shale growth slows, says EIA', body: 'Permian gains plateau on capital discipline.', min: 0.004, max: 0.010 },
  { headline: 'North Sea storm warning issued', body: 'Loading delays possible midweek.', min: 0.002, max: 0.007 },
  { headline: 'Brent CFD market tightens', body: 'Dated Brent premium firms on prompt demand.', min: 0.003, max: 0.008 },
  { headline: 'Profit-taking pulls crude off highs', body: 'Afternoon selling as longs take profit.', min: -0.010, max: -0.004 },
  { headline: 'Short covering lifts crude into the close', body: 'Late buying as shorts square positions.', min: 0.004, max: 0.010 },
  { headline: 'Quiet session; crude ranges sideways', body: 'No fresh drivers; volumes thin.', min: 0, max: 0 },
];

const GRADES: CargoSpec['grade'][] = ['Forties', 'Brent', 'Oseberg', 'Ekofisk', 'Troll'];
const GRADE_DIFF: Record<string, [number, number]> = {
  Forties: [-0.20, 0.30], Brent: [-0.10, 0.15], Oseberg: [0.10, 0.60],
  Ekofisk: [0.20, 0.80], Troll: [-0.60, 0.10],
};
const RULES = [
  { kind: 'around', before: 2, after: 2 },
  { kind: 'around', before: 3, after: 3 },
  { kind: 'after', days: 5 },
  { kind: 'before', days: 3 },
  { kind: 'around', before: 2, after: 2 },
] as const;

const MANAGER_MSGS = [
  'Hi — can you send me your current outright exposure and TCM please?',
  'Confirm your hedge is on for today\'s pricing — reply here.',
  'Are you within your JUN limit? Confirm exposure and TCM.',
  'End-of-day check: send outright exposure and today\'s P&L please.',
];
const COLLEAGUE_MSGS = [
  'How are you getting on? Still hedging those cargoes? Good luck — drinks after?',
  'This market is wild today. How\'s your TCM looking?',
  'Nicely done on that hedge earlier. Coffee after the close?',
];

export function generateScenario(seed: number): Scenario {
  const r = createRng(seed * 2654435761 >>> 0);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r.next() * arr.length)];
  const int = (a: number, b: number) => a + Math.floor(r.next() * (b - a + 1));
  const num = (a: number, b: number) => a + r.next() * (b - a);

  // fixed exercise brief
  const initialCargo: CargoSpec = {
    grade: 'Forties', side: 'S', volumeBbl: 700_000, diff: -0.10,
    blDate: '2024-04-05', rule: { kind: 'around', before: 2, after: 2 },
  };

  const events: ScheduledEvent[] = [];
  const cargoById = new Map<number, CargoSpec & { arrivalDay: number }>();
  cargoById.set(0, { ...initialCargo, arrivalDay: 0 });

  // --- additional cargoes: 3-5 between day0 tick60 and day7 ---
  const nCargoes = int(3, 5);
  let hasBuy = false, hasSell = false;
  for (let i = 0; i < nCargoes; i++) {
    let side: 'B' | 'S' = r.next() < 0.5 ? 'B' : 'S';
    if (i === nCargoes - 1) {
      if (!hasBuy) side = 'B';
      if (!hasSell) side = 'S';
    }
    if (side === 'B') hasBuy = true; else hasSell = true;
    const grade = pick(GRADES);
    const [dlo, dhi] = GRADE_DIFF[grade];
    const day = int(0, 7);
    const tick = day === 0 ? int(60, 340) : int(10, 350);
    const bl = businessDayOffset(TRADING_DAYS[day], int(1, 5));
    const cargoId = i + 1;
    const spec = {
      grade, side, volumeBbl: pick([300, 400, 500, 600, 700, 800]) * 1000,
      diff: Math.round(num(dlo, dhi) * 100) / 100, blDate: bl,
      rule: pick(RULES) as CargoSpec['rule'],
    };
    cargoById.set(cargoId, { ...spec, arrivalDay: day });
    events.push({ day, tick, kind: 'newCargo', cargo: spec });
  }

  // --- B/L shifts: 1-2, targeting cargoes with unfixed days ahead ---
  const nShifts = int(1, 2);
  for (let i = 0; i < nShifts; i++) {
    const cargoId = pick([...cargoById.keys()]);
    const c = cargoById.get(cargoId)!;
    const delta = int(1, 3) * (r.next() < 0.6 ? 1 : -1); // 60% slip later
    const newBl = businessDayOffset(c.blDate, delta);
    const firstIdx = TRADING_DAYS.indexOf(
      pricingDaysFor(c.blDate, c.rule).find((d) => TRADING_DAYS.includes(d)) ?? '9999');
    // sometimes after the first pricing day (over-hedge experience)
    const day = Math.max(c.arrivalDay, Math.min(8,
      r.next() < 0.5 ? int(c.arrivalDay, Math.max(c.arrivalDay, firstIdx))
                    : int(Math.max(c.arrivalDay, firstIdx), Math.max(c.arrivalDay, firstIdx + 2))));
    events.push({ day, tick: int(20, 300), kind: 'blShift', cargoId, newBl });
  }

  // --- news: 14-22 ---
  const nNews = int(14, 22);
  const pool = [...NEWS_POOL];
  for (let i = 0; i < nNews; i++) {
    const t = pool.splice(Math.floor(r.next() * pool.length), 1)[0];
    const jump = t.min === 0 && t.max === 0 ? undefined : num(t.min, t.max);
    events.push({
      day: int(0, 9), tick: int(15, 355), kind: 'news',
      headline: t.headline, body: t.body, brentJumpPct: jump,
    });
  }

  // --- manager messages 2-4 ---
  const nMgr = int(2, 4);
  for (let i = 0; i < nMgr; i++) {
    events.push({
      day: int(1, 8), tick: int(60, 330), kind: 'message',
      thread: 'Control Room', from: 'Trading Manager', text: MANAGER_MSGS[i % MANAGER_MSGS.length],
      expectsReply: true,
    });
  }
  // colleague chit-chat
  events.push({
    day: int(6, 9), tick: int(100, 340), kind: 'message',
    thread: 'Sam (Products)', from: 'Sam (Products)', text: pick(COLLEAGUE_MSGS), expectsReply: false,
  });
  // reminders
  events.push({
    day: 0, tick: 200, kind: 'reminder',
    headline: 'Reminder: desk stop loss is $1,000,000',
    body: 'A book loss of $1m triggers mandatory flattening of POV positions. Inform Control Room immediately.',
  });
  events.push({
    day: 9, tick: 120, kind: 'reminder',
    headline: 'Final day: positions marked at close',
    body: 'All open positions will be valued at closing prices. Final TCM and debrief will be published.',
  });
  // welcome
  events.push({
    day: 0, tick: 10, kind: 'news', headline: 'Welcome to the Smart Market Trading Simulator',
    body: 'You are the Junior Trader on the European North Sea crude team. Hedge your physical book daily with MAY Brent; keep an eye on the $1m stop loss and the JUN POV limit.',
  });

  const volScale = pick([0.7, 1.0, 1.6]);   // calm / normal / volatile
  const driftPerTick = num(-0.00002, 0.00002); // gentle daily drift trend

  return { seed, initialCargo, events, driftPerTick, volScale };
}
