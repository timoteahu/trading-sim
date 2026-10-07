export type SimStatus = 'awaiting' | 'open' | 'paused' | 'finished' | 'disconnected';
export type Side = 'B' | 'S';
export type DealKind = 'future' | 'spread' | 'physical';

export interface Deal {
  id: number;
  ts: string;            // game timestamp "MON 1 APR 09:14"
  day: string;           // ISO day
  tickOfDay: number;     // tick within day at execution
  gtick: number;         // global tick at execution
  mine: boolean;         // person icon col
  counterparty: string;
  status: 'Filled';
  kind: DealKind;
  product: string;       // 'BRENT', 'WTI/BRENT', 'Forties', ...
  contract: string;      // 'MAY' | 'JUN' | 'JUL' | '' for physical
  reference: string;
  bs: Side;
  quantityLots: number;  // futures: lots (signed positive, direction in bs)
  quantityBbl: number;   // physical: barrels
  priceDiff: number | null; // futures: fill price; physical: differential
  basis: string;         // physical: 'May Brent'
  priceFrm: string;      // physical pricing window start
  priceTo: string;       // physical pricing window end
  formula: string;       // physical
  selected: boolean;
}

export interface FuturePosition {
  qty: number;           // signed lots
  avgPrice: number;
  realized: number;      // $ realized for this contract
}

export interface PhysicalFixing {
  date: string;          // pricing day ISO
  volumeBbl: number;
  fixedPrice: number;    // outright price incl diff
}

export interface PhysicalCargo {
  id: number;
  dealId: number;
  grade: 'Forties' | 'Brent' | 'Oseberg' | 'Ekofisk' | 'Troll';
  side: Side;
  volumeBbl: number;
  diff: number;                 // vs basis, e.g. -0.10
  basisContract: 'BRENT:MAY';
  blDate: string;
  rule: import('./calendar').PricingRule;
  pricingDays: string[];
  fixings: PhysicalFixing[];
}

export type ScheduledEvent = { day: number; tick: number } & (
  | { kind: 'news'; headline: string; body: string; brentJumpPct?: number; attachment?: boolean }
  | { kind: 'newCargo'; cargo: CargoSpec }
  | { kind: 'blShift'; cargoId: number; newBl: string }
  | { kind: 'message'; thread: string; from: string; text: string; expectsReply: boolean }
  | { kind: 'reminder'; headline: string; body: string }
);

export interface CargoSpec {
  grade: PhysicalCargo['grade'];
  side: Side;
  volumeBbl: number;
  diff: number;
  blDate: string;
  rule: import('./calendar').PricingRule;
}

export interface Scenario {
  seed: number;
  initialCargo: CargoSpec;
  events: ScheduledEvent[];
  driftPerTick: number;   // applied to Brent pct move each tick
  volScale: number;       // scales tick noise
}

export interface DayClose {
  date: string;
  netOutrightBbl: number;
  pnl: number;
  mayClose: number;
}

export interface NewsItem {
  id: number;
  ts: string;
  day: string;
  headline: string;
  body: string;
  unread: boolean;
  attachment?: boolean;
}

export interface ChatMessage {
  id: number;
  thread: string;   // 'Control Room' | 'Group' | colleague name
  from: string;
  mine: boolean;
  ts: string;
  gtick: number;         // global tick when sent
  expectsReply?: boolean;
  text: string;
}

export interface Quote {
  bid: number;
  ask: number;
  last: number;
  prevClose: number;
  mid: number;
}
