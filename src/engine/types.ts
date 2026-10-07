export type SimStatus = 'awaiting' | 'open' | 'paused' | 'finished' | 'disconnected';
export type Side = 'B' | 'S';
export type DealKind = 'future' | 'spread' | 'physical';

export interface Deal {
  id: number;
  ts: string;            // game timestamp "MON 1 APR 09:14"
  day: string;           // ISO day
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

export interface PhysicalState {
  blDate: string;
  pricingDays: string[];
  totalBbl: number;
  perDayBbl: number;
  diff: number;          // -0.10 vs basis
  basisContract: string; // 'BRENT:MAY'
  fixings: PhysicalFixing[]; // appended as days fix
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
  text: string;
}

export interface Quote {
  bid: number;
  ask: number;
  last: number;
  prevClose: number;
  mid: number;
}
