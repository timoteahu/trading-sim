import { createRng, type Rng } from './rng';
import {
  TRADING_DAYS, formatGameDate, formatShortDate, pricingWindow,
} from './calendar';
import {
  ALL_PRODUCTS, CONTRACTS, LOT_BBL, instrumentId, productByKey,
  type Contract, type ProductDef,
} from './instruments';
import type {
  Deal, FuturePosition, NewsItem, PhysicalState, Quote, SimStatus, Side, ChatMessage,
} from './types';

export const TICKS_PER_DAY = 360; // 6 real minutes at 1x (1 tick/sec)
const DAY_ROLL_TICKS = 3;         // brief "Paused" between days
export const STOP_LOSS = -1_000_000;
export const PHYSICAL_TOTAL_BBL = 700_000;
export const PHYSICAL_PER_DAY_BBL = PHYSICAL_TOTAL_BBL / 5; // 140,000
const INITIAL_BL = '2024-04-05';  // Fri 5 Apr
const SHIFTED_BL = '2024-04-08';  // Mon 8 Apr

export function gameClock(dayIndex: number, tickOfDay: number): string {
  const h = 9 + Math.floor(tickOfDay / 60);
  const m = tickOfDay % 60;
  return `${formatGameDate(TRADING_DAYS[dayIndex])} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface NewsSpec {
  day: number; tick: number; headline: string; body: string; attachment?: boolean;
  brentJumpPct?: number;          // applied to BRENT mid (others follow via beta)
  mutation?: 'BL_SHIFT';
  message?: { thread: string; from: string; text: string };
}

const NEWS: NewsSpec[] = [
  { day: 0, tick: 10, headline: 'Welcome to the Smart Market Trading Simulator',
    body: 'You are the Junior Trader on the European North Sea crude team. Your book: Sold 700 kb Forties @ May Brent -0.10, pricing 2-1-2 around B/L (est. Fri 5 Apr). Keep outright exposure hedged and watch the $1m stop loss.' },
  { day: 0, tick: 60, headline: 'OPEC+ signals discipline on quotas ahead of June meeting',
    body: 'Delegates say compliance with existing output quotas is improving; market reads it as mildly supportive.', brentJumpPct: 0.008 },
  { day: 0, tick: 200, headline: 'Reminder: desk stop loss is $1,000,000',
    body: 'Risk remind all traders that a book loss of $1m triggers mandatory flattening of POV positions. Inform Control Room immediately.' },
  { day: 1, tick: 90, headline: 'Weekly US inventory report: crude draws 3.2 mbbl',
    body: 'API/EIA data show a larger-than-expected crude draw; products mixed. Brent firms on the print.', brentJumpPct: 0.012 },
  { day: 2, tick: 30, headline: 'SHIPPING: Forties cargo B/L revised',
    body: 'Operations advise the B/L for your Forties sale has slipped from Fri 5 Apr to Mon 8 Apr. Pricing window is now 2-1-2 around Mon 8 Apr (Thu 4, Fri 5, Mon 8, Tue 9, Wed 10). Deals and exposure updated.',
    mutation: 'BL_SHIFT' },
  { day: 2, tick: 180, headline: 'OPEC member presses for higher quota',
    body: 'One producer is lobbying for a larger quota at the June meeting; traders pare length.', brentJumpPct: -0.015 },
  { day: 3, tick: 120, headline: 'Trading Manager: exposure check',
    body: 'Please send current outright exposure and TCM to Control Room via Messenger.',
    message: { thread: 'Control Room', from: 'Trading Manager', text: 'Hi — can you send me your current outright exposure and TCM please?' } },
  { day: 4, tick: 60, headline: 'North Sea loading programme steady',
    body: 'Forties loading programme for May published; volumes in line with expectations.' },
  { day: 5, tick: 100, headline: 'OPEC+ denies quota increase rumours',
    body: 'Spokesperson says no quota changes are on the table; crude rallies sharply.', brentJumpPct: 0.018 },
  { day: 6, tick: 45, headline: 'Middle East tensions raise supply-risk premium',
    body: 'Regional escalation lifts the geopolitical premium in crude.', brentJumpPct: 0.014 },
  { day: 6, tick: 240, headline: 'Profit-taking pulls crude off highs',
    body: 'Afternoon selling as longs take profit into the close.', brentJumpPct: -0.009 },
  { day: 7, tick: 150, headline: 'Colleague: drinks after the sim?',
    body: '', message: { thread: 'Sam (Products)', from: 'Sam (Products)', text: 'How are you getting on? Still hedging that Forties? Good luck — drinks after?' } },
  { day: 8, tick: 70, headline: 'Refinery margins soften in Europe',
    body: 'Gasoil cracks ease as run rates stay high; crude steady.', brentJumpPct: -0.006 },
  { day: 8, tick: 220, headline: 'OPEC quota headline: ministers to meet early',
    body: 'An early ministerial meeting is announced; market adds length on expected restraint.', brentJumpPct: 0.01 },
  { day: 9, tick: 120, headline: 'Final day: positions marked at close',
    body: 'Reminder — all open positions will be valued at closing prices. Final TCM will be published.', attachment: true },
];

export interface SimOptions {
  seed?: number;
  user?: string;
  team?: string;
}

export class SimEngine {
  rng: Rng;
  status: SimStatus = 'awaiting';
  speed = 1;
  dayIndex = 0;
  tickOfDay = 0;
  rollCountdown = 0;

  user = 'Trader';
  team = 'Trader';

  mids = new Map<string, number>();
  prevClose = new Map<string, number>();
  lasts = new Map<string, number>();
  history = new Map<string, number[]>();   // per-contract mid history (per tick)
  anchors = new Map<string, number>();     // mean-reversion anchor per product

  deals: Deal[] = [];
  private nextDealId = 1;
  positions = new Map<string, FuturePosition>();

  physical: PhysicalState;
  news: NewsItem[] = [];
  private nextNewsId = 1;
  private firedNews = new Set<number>();
  messages: ChatMessage[] = [];
  private nextMsgId = 1;
  pendingAcks: { tick: number; thread: string }[] = [];
  toasts: string[] = [];
  stopLossHit = false;
  globalTick = 0; // ticks since sim start (for ack delays)

  constructor(opts: SimOptions = {}) {
    this.rng = createRng(opts.seed ?? 42);
    this.user = opts.user ?? 'Trader';
    this.team = opts.team ?? this.user;
    for (const p of ALL_PRODUCTS) {
      for (const c of CONTRACTS) {
        const id = instrumentId(p.key, c);
        const base = p.legs ? 0 : p.base[c];
        this.mids.set(id, base);
        this.prevClose.set(id, base);
        this.lasts.set(id, base);
        this.history.set(id, []);
      }
      this.anchors.set(p.key, p.legs ? 0 : p.base.MAY);
    }
    // spread mids derived
    for (const p of ALL_PRODUCTS) {
      if (p.legs) for (const c of CONTRACTS) {
        const id = instrumentId(p.key, c);
        const v = this.mids.get(instrumentId(p.legs[0], c))! - this.mids.get(instrumentId(p.legs[1], c))!;
        this.mids.set(id, v); this.prevClose.set(id, v); this.lasts.set(id, v);
      }
    }
    this.physical = {
      blDate: INITIAL_BL,
      pricingDays: pricingWindow(INITIAL_BL),
      totalBbl: PHYSICAL_TOTAL_BBL,
      perDayBbl: PHYSICAL_PER_DAY_BBL,
      diff: -0.10,
      basisContract: 'BRENT:MAY',
      fixings: [],
    };
    this.deals.push(this.makePhysicalDeal());
    this.messages.push({
      id: this.nextMsgId++, thread: 'Control Room', from: 'Control Room', mine: false,
      ts: gameClock(0, 0), text: 'Welcome to the simulation. Market opens shortly.',
    });
  }

  private makePhysicalDeal(): Deal {
    const win = this.physical.pricingDays;
    return {
      id: this.nextDealId++, ts: gameClock(0, 0), day: TRADING_DAYS[0], mine: true,
      counterparty: 'North Sea Crude Senior Trader', status: 'Filled', kind: 'physical',
      product: 'Forties', contract: '', reference: '', bs: 'S',
      quantityLots: 0, quantityBbl: PHYSICAL_TOTAL_BBL,
      priceDiff: -0.10, basis: 'May Brent',
      priceFrm: formatShortDate(win[0]), priceTo: formatShortDate(win[win.length - 1]),
      formula: '2-1-2 around B/L', selected: false,
    };
  }

  private refreshPhysicalDealWindow() {
    const d = this.deals.find((x) => x.kind === 'physical');
    if (!d) return;
    const win = this.physical.pricingDays;
    d.priceFrm = formatShortDate(win[0]);
    d.priceTo = formatShortDate(win[win.length - 1]);
  }

  // ----- controls -----
  start() { if (this.status === 'awaiting' || this.status === 'paused') this.status = 'open'; }
  pause() { if (this.status === 'open') this.status = 'paused'; }
  resume() { if (this.status === 'paused') this.status = 'open'; }
  setSpeed(s: number) { this.speed = s; }

  // ----- quotes -----
  mid(id: string): number { return this.mids.get(id) ?? 0; }
  quote(product: string, contract: Contract): Quote {
    const p = productByKey(product);
    const id = instrumentId(product, contract);
    const mid = this.mid(id);
    return {
      mid,
      bid: mid - p.halfSpread,
      ask: mid + p.halfSpread,
      last: this.lasts.get(id) ?? mid,
      prevClose: this.prevClose.get(id) ?? mid,
    };
  }

  /** Execute a futures/spread deal. Fill = current ask (buy) / bid (sell). */
  executeDeal(product: string, contract: Contract, side: Side, lots: number): Deal {
    const q = this.quote(product, contract);
    const price = side === 'B' ? q.ask : q.bid;
    const id = instrumentId(product, contract);
    const p = productByKey(product);
    const dir = side === 'B' ? 1 : -1;
    const pos = this.positions.get(id) ?? { qty: 0, avgPrice: 0, realized: 0 };
    const tradeQty = dir * lots;
    if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(tradeQty)) {
      pos.avgPrice = pos.qty === 0 ? price : (pos.avgPrice * Math.abs(pos.qty) + price * lots) / (Math.abs(pos.qty) + lots);
      pos.qty += tradeQty;
    } else {
      const closing = Math.min(Math.abs(pos.qty), lots);
      pos.realized += closing * LOT_BBL * (price - pos.avgPrice) * Math.sign(pos.qty);
      pos.qty += tradeQty;
      if (Math.sign(pos.qty) !== Math.sign(pos.qty - tradeQty) || pos.qty === 0) {
        pos.avgPrice = pos.qty === 0 ? 0 : price;
      }
    }
    this.positions.set(id, pos);

    const deal: Deal = {
      id: this.nextDealId++, ts: gameClock(this.dayIndex, this.tickOfDay),
      day: TRADING_DAYS[this.dayIndex], mine: true, counterparty: 'Exchange',
      status: 'Filled', kind: p.legs ? 'spread' : 'future', product: p.name,
      contract, reference: '', bs: side, quantityLots: lots, quantityBbl: lots * LOT_BBL,
      priceDiff: price, basis: '', priceFrm: '', priceTo: '', formula: '', selected: false,
    };
    this.deals.unshift(deal);

    // June Brent POV limit
    if (p.key === 'BRENT' && contract === 'JUN') {
      const net = this.positions.get(id)?.qty ?? 0;
      if (Math.abs(net) > (p.povLimitLots ?? 100)) {
        this.toasts.push(`POV limit breach: net ${net} lots JUN Brent exceeds limit ${p.povLimitLots}`);
      }
    }
    return deal;
  }

  // ----- exposure -----
  /**
   * Outright exposure in BBL by contract/commodity.
   * Pass `deals` (e.g. selected subset) to replicate the "Show selected" quirk:
   * futures legs are counted only for deals in the list; physical always counts.
   */
  exposure(deals?: Deal[]): Map<string, number> {
    const out = new Map<string, number>();
    const add = (k: string, v: number) => out.set(k, (out.get(k) ?? 0) + v);
    if (deals) {
      for (const d of deals) {
        if (d.kind === 'physical') continue;
        const id = instrumentId(d.product === 'Forties' ? d.product : this.keyOf(d.product), d.contract);
        const dir = d.bs === 'B' ? 1 : -1;
        add(id, dir * d.quantityLots * LOT_BBL);
      }
    } else {
      for (const [id, pos] of this.positions) add(id, pos.qty * LOT_BBL);
    }
    // physical: each fixed pricing day -> short outright in basis contract
    for (const f of this.physical.fixings) add(this.physical.basisContract, -f.volumeBbl);
    return out;
  }

  private keyOf(name: string): string {
    return ALL_PRODUCTS.find((p) => p.name === name || p.key === name)?.key ?? name;
  }

  totalExposureBbl(deals?: Deal[]): number {
    let t = 0;
    for (const v of this.exposure(deals).values()) t += v;
    return t;
  }

  /** Hedging profile rows per pricing day. */
  hedgingProfile() {
    const hedgeBbl = (this.positions.get('BRENT:MAY')?.qty ?? 0) * LOT_BBL;
    let cum = 0;
    return this.physical.pricingDays.map((d) => {
      const fixing = this.physical.fixings.find((f) => f.date === d);
      const pricing = -this.physical.perDayBbl;
      if (fixing) cum += pricing;
      return {
        date: d,
        pricingVolumeBbl: pricing,
        fixed: !!fixing,
        fixedPrice: fixing?.fixedPrice ?? null,
        cumPricedExposureBbl: cum,
        hedgesBbl: hedgeBbl,
        hedgeRequiredBbl: fixing ? -(cum + hedgeBbl) : 0,
      };
    });
  }

  // ----- P&L -----
  futuresPnl(): number {
    let total = 0;
    for (const [id, pos] of this.positions) {
      total += pos.realized + pos.qty * LOT_BBL * (this.mid(id) - pos.avgPrice);
    }
    return total;
  }
  physicalPnl(): number {
    const cur = this.mid(this.physical.basisContract);
    let t = 0;
    for (const f of this.physical.fixings) t += (f.fixedPrice - cur) * f.volumeBbl;
    return t;
  }
  totalPnl(): number { return this.futuresPnl() + this.physicalPnl(); }

  // ----- messaging -----
  sendMessage(thread: string, text: string, from?: string) {
    this.messages.push({
      id: this.nextMsgId++, thread, from: from ?? this.user, mine: !from,
      ts: gameClock(this.dayIndex, this.tickOfDay), text,
    });
    if (!from) this.pendingAcks.push({ tick: this.globalTick + 3, thread });
  }

  private pushNews(spec: NewsSpec) {
    this.news.unshift({
      id: this.nextNewsId++, ts: gameClock(this.dayIndex, this.tickOfDay),
      day: TRADING_DAYS[this.dayIndex], headline: spec.headline, body: spec.body,
      unread: true, attachment: spec.attachment,
    });
    if (spec.brentJumpPct) {
      const id = 'BRENT:MAY';
      const a = this.anchors.get('BRENT') ?? 0;
      this.anchors.set('BRENT', a * (1 + spec.brentJumpPct));
      for (const c of CONTRACTS) {
        const k = instrumentId('BRENT', c);
        this.mids.set(k, this.mids.get(k)! * (1 + spec.brentJumpPct));
      }
      void id;
    }
    if (spec.mutation === 'BL_SHIFT') {
      this.physical.blDate = SHIFTED_BL;
      this.physical.pricingDays = pricingWindow(SHIFTED_BL);
      this.refreshPhysicalDealWindow();
    }
    if (spec.message) {
      this.messages.push({
        id: this.nextMsgId++, thread: spec.message.thread, from: spec.message.from,
        mine: false, ts: gameClock(this.dayIndex, this.tickOfDay), text: spec.message.text,
      });
    }
  }

  /** Advance one tick. Called by UI timer at speed-scaled rate; call directly in tests. */
  tick() {
    this.globalTick++;
    // delayed control-room acks
    for (let i = this.pendingAcks.length - 1; i >= 0; i--) {
      if (this.pendingAcks[i].tick <= this.globalTick) {
        const { thread } = this.pendingAcks[i];
        this.messages.push({
          id: this.nextMsgId++, thread, from: thread, mine: false,
          ts: gameClock(this.dayIndex, this.tickOfDay), text: 'Noted, thanks.',
        });
        this.pendingAcks.splice(i, 1);
      }
    }
    if (this.status === 'paused' && this.rollCountdown > 0) {
      this.rollCountdown--;
      if (this.rollCountdown === 0) this.status = 'open';
      return;
    }
    if (this.status !== 'open') return;

    // news scheduled for now
    NEWS.forEach((spec, i) => {
      if (spec.day === this.dayIndex && spec.tick === this.tickOfDay && !this.firedNews.has(i)) {
        this.firedNews.add(i);
        this.pushNews(spec);
      }
    });

    // market step: Brent random-walk-ish pct move; others follow by beta
    const brentId = instrumentId('BRENT', 'MAY');
    const brentMid = this.mids.get(brentId)!;
    const anchor = this.anchors.get('BRENT')!;
    const reversion = (anchor - brentMid) / brentMid * 0.02;
    const brentPct = reversion + this.rng.normal() * 0.0008;
    for (const p of ALL_PRODUCTS) {
      if (p.legs) continue;
      const follow = p.key === 'BRENT' ? brentPct : p.beta * brentPct + this.rng.normal() * p.noise;
      const anch = this.anchors.get(p.key)!;
      const midMay = this.mids.get(instrumentId(p.key, 'MAY'))!;
      const ownRev = p.key === 'BRENT' ? 0 : (anch - midMay) / midMay * 0.01;
      for (const c of CONTRACTS) {
        const id = instrumentId(p.key, c);
        const m = this.mids.get(id)!;
        const monthNoise = this.rng.normal() * 0.00005;
        this.mids.set(id, Math.max(0.01, m * (1 + follow + ownRev + monthNoise)));
        const last = this.mids.get(id)! * (1 + this.rng.normal() * 0.0001);
        this.lasts.set(id, last);
        this.history.get(id)!.push(this.mids.get(id)!);
      }
    }
    // derived spreads
    for (const p of ALL_PRODUCTS) {
      if (!p.legs) continue;
      for (const c of CONTRACTS) {
        const id = instrumentId(p.key, c);
        const v = this.mids.get(instrumentId(p.legs[0], c))! - this.mids.get(instrumentId(p.legs[1], c))!;
        this.mids.set(id, v);
        this.lasts.set(id, v);
        this.history.get(id)!.push(v);
      }
    }

    this.tickOfDay++;
    if (this.tickOfDay >= TICKS_PER_DAY) this.endOfDay();

    // stop loss
    if (!this.stopLossHit && this.totalPnl() <= STOP_LOSS) {
      this.stopLossHit = true;
      this.news.unshift({
        id: this.nextNewsId++, ts: gameClock(this.dayIndex, this.tickOfDay),
        day: TRADING_DAYS[this.dayIndex], headline: 'STOP LOSS BREACHED',
        body: 'Book loss has reached $1,000,000. Flatten POV positions and inform Control Room.',
        unread: true,
      });
    }
  }

  private endOfDay() {
    const day = TRADING_DAYS[this.dayIndex];
    // physical fixing if today is a pricing day
    if (this.physical.pricingDays.includes(day) && !this.physical.fixings.some((f) => f.date === day)) {
      const close = this.mids.get(this.physical.basisContract)!;
      this.physical.fixings.push({
        date: day, volumeBbl: this.physical.perDayBbl, fixedPrice: close + this.physical.diff,
      });
    }
    // record closes
    for (const [id, m] of this.mids) this.prevClose.set(id, m);
    this.tickOfDay = 0;
    if (this.dayIndex >= TRADING_DAYS.length - 1) {
      this.status = 'finished';
      this.news.unshift({
        id: this.nextNewsId++, ts: gameClock(this.dayIndex, TICKS_PER_DAY - 1),
        day, headline: 'Simulation finished — final summary',
        body: `Final TCM: $${Math.round(this.totalPnl()).toLocaleString('en-US')}. All open positions valued at closing prices.`,
        unread: true,
      });
    } else {
      this.dayIndex++;
      this.status = 'paused';
      this.rollCountdown = DAY_ROLL_TICKS;
    }
  }

  changeOf(product: string, contract: Contract): { diff: number; glyph: 'up' | 'down' | 'flat' } {
    const id = instrumentId(product, contract);
    const diff = (this.lasts.get(id) ?? 0) - (this.prevClose.get(id) ?? 0);
    return { diff, glyph: Math.abs(diff) < 1e-9 ? 'flat' : diff > 0 ? 'up' : 'down' };
  }
}
