import { create } from 'zustand';
import { SimEngine } from './engine/sim';
import type { Contract } from './engine/instruments';
import type { Side } from './engine/types';

export type InstrumentTab = 'Futures' | 'Physical' | 'Swaps' | 'Freight' | 'Storage';
export type BottomTab = 'Deals' | 'Exposure' | 'Charts' | 'Messenger' | 'Debrief';

function seedFromUrl(): number {
  const s = new URLSearchParams(window.location.search).get('seed');
  const n = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) ? n : Math.floor(Math.random() * 1_000_000);
}

interface Ticket { side: Side; product: string; contract: Contract }

interface UiState {
  engine: SimEngine;
  version: number;                 // bumped to re-render on engine changes
  instrumentTab: InstrumentTab;
  bottomTab: BottomTab;
  ticket: Ticket | null;
  expandedNews: number | null;
  bigFont: boolean;
  page: number;
  perPage: number;
  onlyMine: boolean;
  showSelectedOnly: boolean;
  refFilter: string;
  refInput: string;
  exposurePopped: boolean;
  chartA: string | null;           // instrumentId 'BRENT:MAY'
  chartB: string | null;
  chartSelectArmed: boolean;
  emaFast: boolean;
  emaSlow: boolean;
  hedgingDay: number;              // index into pricing days
  msgInputs: Record<string, string>;
  activeThread: string;
  controlOpen: boolean;

  bump(): void;
  set(partial: Partial<UiState>): void;
}

/** Subscribe to engine ticks and return the engine. Use in every component reading engine state. */
export function useEngine(): SimEngine {
  useUi((s) => s.version);
  return useUi((s) => s.engine);
}

export const useUi = create<UiState>((set) => ({
  engine: new SimEngine({ seed: seedFromUrl(), user: 'Trader', team: 'Trader' }),
  version: 0,
  instrumentTab: 'Futures',
  bottomTab: 'Deals',
  ticket: null,
  expandedNews: null,
  bigFont: false,
  page: 0,
  perPage: 15,
  onlyMine: false,
  showSelectedOnly: false,
  refFilter: '',
  refInput: '',
  exposurePopped: false,
  chartA: null,
  chartB: null,
  chartSelectArmed: false,
  emaFast: false,
  emaSlow: false,
  hedgingDay: 0,
  msgInputs: {},
  activeThread: 'Control Room',
  controlOpen: true,
  bump: () => set((s) => ({ version: s.version + 1 })),
  set: (partial) => set(partial),
}));
