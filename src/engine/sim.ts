import { createRng, type Rng } from './rng';
import {
  TRADING_DAYS, addDays, formatGameDate, formatShortDate, isBusinessDay,
  pricingDaysFor, describeRule,
} from './calendar';
import {
  ALL_PRODUCTS, CONTRACTS, LOT_BBL, instrumentId, productByKey,
  type Contract,
} from './instruments';
import { generateScenario } from './scenario';
import type {
  Deal, FuturePosition, NewsItem, Quote, SimStatus, Side, ChatMessage,
  PhysicalCargo, CargoSpec, Scenario, DayClose,
} from './types';

export const TICKS_PER_DAY = 360; // 6 real minutes at 1x (1 tick/sec)
const DAY_ROLL_TICKS = 3;         // brief "Paused" between days
export const STOP_LOSS = -1_000_000;

export function gameClock(dayIndex: number, tickOfDay: number): string {
  const h = 9 + Math.floor(tickOfDay / 60);
  const m = tickOfDay % 60;
  return `${formatGameDate(TRADING_DAYS[dayIndex])} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface SimOptions {
  seed?: number;
  user?: string;
  team?: string;
  scenario?: Scenario;   // explicit scenario (tests); otherwise generated from seed
}

export class SimEngine {
  rng: Rng;
  scenario: Scenario;
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
  history = new Map<string, number[]>();
  anchors = new Map<string, number>();

  deals: Deal[] = [];
  private nextDealId = 1;
  positions = new Map<string, FuturePosition>();

  physicals: PhysicalCargo[] = [];
  private nextCargoId = 0;

  news: NewsItem[] = [];
  private nextNewsId = 1;
  private firedEvents = new Set<number>();
  messages: ChatMessage[] = [];
  private nextMsgId = 1;
  pendingAcks: { tick: number; thread: string }[] = [];
  toasts: string[] = [];
  globalTick = 0;

  stopLossHit = false;
  stopLossTick = -1;
  povFlattenTick = -1;         // gtick when JUN net returned within limit after breach
  maxJunQty = 0;               // max |JUN Brent| lots seen
  junBreachCount = 0;
  dayCloses: DayClose[] = [];

  constructor(opts: SimOptions = {}) {
    this.scenario = opts.scenario ?? generateScenario(opts.seed ?? 42);
    this.rng = createRng(this.scenario.seed);
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
    for (const p of ALL_PRODUCTS) {
      if (p.legs) for (const c of CONTRACTS) {
        const id = instrumentId(p.key, c);
        const v = this.mids.get(instrumentId(p.legs[0], c))! - this.mids.get(instrumentId(p.legs[1], c))!;
        this.mids.set(id, v); this.prevClose.set(id, v); this.lasts.set(id, v);
      }
    }
    this.addCargo(this.scenario.initialCargo);
    this.pushMsg('Control Room', 'Control Room', 'Welcome to the simulation. Market opens shortly.', false);
  }

  // ----- cargo -----
  addCargo(spec: CargoSpec): PhysicalCargo {
    const cargo: PhysicalCargo = {
      id: this.nextCargoId++,
      dealId: -1,
      grade: spec.grade, side: spec.side, volumeBbl: spec.volumeBbl,
      diff: spec.diff, basisContract: 'BRENT:MAY',
      blDate: spec.blDate, rule: spec.rule,
      pricingDays: pricingDaysFor(spec.blDate, spec.rule),
      fixings: [],
    };
    cargo.dealId = this.nextDealId;
    const win = cargo.pricingDays;
    this.deals.push({
      id: this.nextDealId++, ts: gameClock(this.dayIndex, this.tickOfDay),
      day: TRADING_DAYS[this.dayIndex], tickOfDay: this.tickOfDay, gtick: this.globalTick,
      mine: true, counterparty: 'North Sea Crude Senior Trader', status: 'Filled',
      kind: 'physical', product: cargo.grade, contract: '', reference: '', bs: cargo.side,
      quantityLots: 0, quantityBbl: cargo.volumeBbl,
      priceDiff: cargo.diff, basis: 'May Brent',
      priceFrm: formatShortDate(win[0]), priceTo: formatShortDate(win[win.length - 1]),
      formula: describeRule(cargo.rule), selected: false,
    });
    this.physicals.push(cargo);
    return cargo;
  }

  perDayBbl(cargo: PhysicalCargo, dayIso: string): number {
    const n = cargo.pricingDays.length;
    const idx = cargo.pricingDays.indexOf(dayIso);
    if (idx < 0) return 0;
    const base = Math.round(cargo.volumeBbl / n);
    if (idx === n - 1) return cargo.volumeBbl - base * (n - 1); // last day absorbs rounding
    return base;
  }

  private refreshCargoDeal(cargo: PhysicalCargo) {
    const d = this.deals.find((x) => x.id === cargo.dealId);
    if (!d) return;
    const win = cargo.pricingDays;
    d.priceFrm = formatShortDate(win[0]);
    d.priceTo = formatShortDate(win[win.length - 1]);
  }

  private shiftCargo(cargoId: number, newBl: string) {
    const cargo = this.physicals.find((c) => c.id === cargoId);
    if (!cargo) return;
    cargo.blDate = newBl;
    cargo.pricingDays = pricingDaysFor(newBl, cargo.rule);
    cargo.fixings = cargo.fixings.filter((f) => cargo.pricingDays.includes(f.date));
    this.refreshCargoDeal(cargo);
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

  executeDeal(product: string, contract: Contract, side: Side, lots: number): Deal {
    const q = this.quote(product, contract);
    const price = side === 'B' ? q.ask : q.bid;
    const id = instrumentId(product, contract);
    const p = productByKey(product);
    const dir = side === 'B' ? 1 : -1;
    const pos = this.positions.get(id) ?? { qty: 0, avgPrice: 0, realized: 0 };
    const tradeQty = dir * lots;
    if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(tradeQty)) {
      pos.avgPrice = pos.qty === 0 ? price
        : (pos.avgPrice * Math.abs(pos.qty) + price * lots) / (Math.abs(pos.qty) + lots);
      pos.qty += tradeQty;
    } else {
      const closing = Math.min(Math.abs(pos.qty), lots);
      pos.realized += closing * LOT_BBL * (price - pos.avgPrice) * Math.sign(pos.qty);
      const before = pos.qty;
      pos.qty += tradeQty;
      if (pos.qty === 0 || Math.sign(pos.qty) !== Math.sign(before)) pos.avgPrice = pos.qty === 0 ? 0 : price;
    }
    this.positions.set(id, pos);

    const deal: Deal = {
      id: this.nextDealId++, ts: gameClock(this.dayIndex, this.tickOfDay),
      day: TRADING_DAYS[this.dayIndex], tickOfDay: this.tickOfDay, gtick: this.globalTick,
      mine: true, counterparty: 'Exchange', status: 'Filled',
      kind: p.legs ? 'spread' : 'future', product: p.name,
      contract, reference: '', bs: side, quantityLots: lots, quantityBbl: lots * LOT_BBL,
      priceDiff: price, basis: '', priceFrm: '', priceTo: '', formula: '', selected: false,
    };
    this.deals.unshift(deal);

    if (p.key === 'BRENT' && contract === 'JUN') {
      const net = this.positions.get(id)?.qty ?? 0;
      this.maxJunQty = Math.max(this.maxJunQty, Math.abs(net));
      const limit = p.povLimitLots ?? 100;
      if (Math.abs(net) > limit) {
        this.junBreachCount++;
        this.toasts.push(`POV limit breach: net ${net} lots JUN Brent exceeds limit ${limit}`);
      }
      if (this.stopLossHit && this.povFlattenTick < 0 && Math.abs(net) <= limit) {
        this.povFlattenTick = this.globalTick;
      }
    }
    return deal;
  }

  // ----- exposure -----
  /** signed bbl of priced physical exposure per cargo (sold -> negative). */
  private physicalSigned(c: PhysicalCargo): number {
    const s = c.side === 'S' ? -1 : 1;
    return s * c.fixings.reduce((a, f) => a + f.volumeBbl, 0);
  }

  physicalExposureByGrade(): Map<string, number> {
    const m = new Map<string, number>();
    for (const c of this.physicals) {
      m.set(c.grade, (m.get(c.grade) ?? 0) + this.physicalSigned(c));
    }
    return m;
  }

  exposure(deals?: Deal[]): Map<string, number> {
    const out = new Map<string, number>();
    const add = (k: string, v: number) => out.set(k, (out.get(k) ?? 0) + v);
    const addPhys = () => {
      for (const c of this.physicals) add(c.basisContract, this.physicalSigned(c));
    };
    if (deals) {
      for (const d of deals) {
        if (d.kind === 'physical') continue;
        const id = instrumentId(this.keyOf(d.product), d.contract);
        const dir = d.bs === 'B' ? 1 : -1;
        add(id, dir * d.quantityLots * LOT_BBL);
      }
      if (deals.some((d) => d.kind === 'physical')) addPhys();
    } else {
      for (const [id, pos] of this.positions) add(id, pos.qty * LOT_BBL);
      addPhys();
    }
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

  mayFuturesBbl(): number {
    return (this.positions.get('BRENT:MAY')?.qty ?? 0) * LOT_BBL;
  }

  /** One row per business day from today through the last pricing day of any cargo. */
  hedgingProfile() {
    const today = TRADING_DAYS[this.dayIndex];
    let end = today;
    for (const c of this.physicals) {
      const last = c.pricingDays[c.pricingDays.length - 1];
      if (last && last > end) end = last;
    }
    const rows: {
      date: string;
      byCargo: { cargoId: number; grade: string; side: Side; pricingBbl: number }[];
      pricingNetBbl: number;
      hedgeRequiredLots: number;
      fixed: boolean;
      cumPricedExposureBbl: number;
      hedgesBbl: number;
      netOutrightBbl: number;
    }[] = [];
    let cum = 0;
    // cumulative priced exposure up to (but not incl.) the row range start
    for (const c of this.physicals)
      for (const f of c.fixings) if (f.date < today) cum += (c.side === 'S' ? -1 : 1) * f.volumeBbl;
    for (let d = today; d <= end; d = addDays(d, 1)) {
      if (!isBusinessDay(d)) continue;
      const byCargo = this.physicals
        .filter((c) => c.pricingDays.includes(d))
        .map((c) => ({
          cargoId: c.id, grade: c.grade, side: c.side,
          pricingBbl: (c.side === 'S' ? -1 : 1) * this.perDayBbl(c, d),
        }));
      const pricingNet = byCargo.reduce((a, b) => a + b.pricingBbl, 0);
      const allFixed = byCargo.length > 0 && byCargo.every((b) =>
        this.physicals.find((c) => c.id === b.cargoId)!.fixings.some((f) => f.date === d));
      if (allFixed) cum += pricingNet;
      rows.push({
        date: d, byCargo, pricingNetBbl: pricingNet,
        hedgeRequiredLots: -pricingNet / LOT_BBL || 0,
        fixed: allFixed,
        cumPricedExposureBbl: cum,
        hedgesBbl: this.mayFuturesBbl(),
        netOutrightBbl: cum + this.mayFuturesBbl(),
      });
    }
    return rows;
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
    const cur = this.mid('BRENT:MAY');
    let t = 0;
    for (const c of this.physicals) {
      const s = c.side === 'S' ? 1 : -1; // sold: gains when price falls
      for (const f of c.fixings) t += s * ((f.fixedPrice - c.diff) - cur) * f.volumeBbl;
    }
    return t;
  }
  totalPnl(): number { return this.futuresPnl() + this.physicalPnl(); }

  // ----- messaging -----
  private pushMsg(thread: string, from: string, text: string, mine: boolean, expectsReply = false) {
    this.messages.push({
      id: this.nextMsgId++, thread, from, mine,
      ts: gameClock(this.dayIndex, this.tickOfDay), gtick: this.globalTick,
      expectsReply, text,
    });
  }
  sendMessage(thread: string, text: string, from?: string) {
    this.pushMsg(thread, from ?? this.user, text, !from);
    if (!from) this.pendingAcks.push({ tick: this.globalTick + 3, thread });
  }

  private pushNews(headline: string, body: string, attachment?: boolean) {
    this.news.unshift({
      id: this.nextNewsId++, ts: gameClock(this.dayIndex, this.tickOfDay),
      day: TRADING_DAYS[this.dayIndex], headline, body, unread: true, attachment,
    });
  }

  private applyJump(pct: number) {
    const a = this.anchors.get('BRENT') ?? 0;
    this.anchors.set('BRENT', a * (1 + pct));
    for (const c of CONTRACTS) {
      const k = instrumentId('BRENT', c);
      this.mids.set(k, this.mids.get(k)! * (1 + pct));
    }
  }

  private fireEvent(e: Scenario['events'][number]) {
    switch (e.kind) {
      case 'news':
        this.pushNews(e.headline, e.body, e.attachment);
        if (e.brentJumpPct) this.applyJump(e.brentJumpPct);
        break;
      case 'reminder':
        this.pushNews(e.headline, e.body);
        break;
      case 'message':
        this.pushMsg(e.thread, e.from, e.text, false, e.expectsReply);
        this.pushNews(`${e.from}: message received`, e.text.slice(0, 120));
        break;
      case 'newCargo': {
        const c = this.addCargo(e.cargo);
        const bs = e.cargo.side === 'S' ? 'Sold' : 'Bought';
        const text = `${bs} ${fmtKb(e.cargo.volumeBbl)} ${e.cargo.grade} @ May Brent ${fmtSigned(e.cargo.diff)}, ${describeRule(e.cargo.rule)} (B/L ${formatShortDate(e.cargo.blDate)})`;
        this.pushNews(`Senior Trader: ${text}`, 'New physical cargo booked to your book. See Deals for details.');
        this.pushMsg('Control Room', 'Senior Trader', text, false);
        void c;
        break;
      }
      case 'blShift': {
        const c = this.physicals.find((x) => x.id === e.cargoId);
        if (!c) break;
        const oldBl = c.blDate;
        this.shiftCargo(e.cargoId, e.newBl);
        const text = `B/L for your ${c.grade} cargo (${c.side === 'S' ? 'sale' : 'purchase'}) moved from ${formatShortDate(oldBl)} to ${formatShortDate(e.newBl)}. Pricing window now ${describeRule(c.rule)} — check Deals and exposure.`;
        this.pushNews(`SHIPPING: ${c.grade} cargo B/L revised`, text);
        this.pushMsg('Control Room', 'Operations', text, false);
        break;
      }
    }
  }

  /** Advance one tick. Called by UI timer at speed-scaled rate; call directly in tests. */
  tick() {
    this.globalTick++;
    for (let i = this.pendingAcks.length - 1; i >= 0; i--) {
      if (this.pendingAcks[i].tick <= this.globalTick) {
        const { thread } = this.pendingAcks[i];
        this.pushMsg(thread, thread, 'Noted, thanks.', false);
        this.pendingAcks.splice(i, 1);
      }
    }
    if (this.status === 'paused' && this.rollCountdown > 0) {
      this.rollCountdown--;
      if (this.rollCountdown === 0) this.status = 'open';
      return;
    }
    if (this.status !== 'open') return;

    this.scenario.events.forEach((e, i) => {
      if (e.day === this.dayIndex && e.tick === this.tickOfDay && !this.firedEvents.has(i)) {
        this.firedEvents.add(i);
        this.fireEvent(e);
      }
    });

    // market step
    const brentId = instrumentId('BRENT', 'MAY');
    const brentMid = this.mids.get(brentId)!;
    const anchor = this.anchors.get('BRENT')!;
    const reversion = (anchor - brentMid) / brentMid * 0.02;
    const vol = this.scenario.volScale;
    const brentPct = reversion + this.scenario.driftPerTick + this.rng.normal() * 0.0008 * vol;
    for (const p of ALL_PRODUCTS) {
      if (p.legs) continue;
      const follow = p.key === 'BRENT' ? brentPct
        : p.beta * brentPct + this.rng.normal() * p.noise * vol;
      const anch = this.anchors.get(p.key)!;
      const midMay = this.mids.get(instrumentId(p.key, 'MAY'))!;
      const ownRev = p.key === 'BRENT' ? 0 : (anch - midMay) / midMay * 0.01;
      for (const c of CONTRACTS) {
        const id = instrumentId(p.key, c);
        const m = this.mids.get(id)!;
        const monthNoise = this.rng.normal() * 0.00005 * vol;
        this.mids.set(id, Math.max(0.01, m * (1 + follow + ownRev + monthNoise)));
        this.lasts.set(id, this.mids.get(id)! * (1 + this.rng.normal() * 0.0001));
        this.history.get(id)!.push(this.mids.get(id)!);
      }
    }
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

    if (!this.stopLossHit && this.totalPnl() <= STOP_LOSS) {
      this.stopLossHit = true;
      this.stopLossTick = this.globalTick;
      this.pushNews('STOP LOSS BREACHED',
        'Book loss has reached $1,000,000. Flatten POV positions and inform Control Room.');
      this.toasts.push('STOP LOSS BREACHED — flatten POV positions and inform Control Room');
    }
  }

  private endOfDay() {
    const day = TRADING_DAYS[this.dayIndex];
    for (const c of this.physicals) {
      if (c.pricingDays.includes(day) && !c.fixings.some((f) => f.date === day)) {
        const close = this.mids.get(c.basisContract)!;
        c.fixings.push({ date: day, volumeBbl: this.perDayBbl(c, day), fixedPrice: close + c.diff });
      }
    }
    for (const [id, m] of this.mids) this.prevClose.set(id, m);

    const netOut = this.totalExposureBbl();
    this.dayCloses.push({
      date: day, netOutrightBbl: netOut,
      pnl: this.totalPnl(), mayClose: this.mids.get('BRENT:MAY')!,
    });
    if (Math.abs(netOut) >= LOT_BBL) {
      const msg = `COMPLIANCE: unhedged outright exposure of (${Math.abs(Math.round(netOut)).toLocaleString('en-US')}) bbl carried overnight`;
      this.toasts.push(msg);
      this.pushNews(msg, 'You ended a pricing day with outright exposure. This will be marked in your debrief.');
    }

    this.tickOfDay = 0;
    if (this.dayIndex >= TRADING_DAYS.length - 1) {
      this.status = 'finished';
      this.pushNews('Simulation finished — final summary',
        `Final TCM: $${Math.round(this.totalPnl()).toLocaleString('en-US')}. All open positions valued at closing prices. Check the Debrief tab.`);
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

function fmtKb(bbl: number) { return `${Math.round(bbl / 1000)}kb`; }
function fmtSigned(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2); }
