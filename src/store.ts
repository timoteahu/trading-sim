import { create } from 'zustand';
import { SimEngine } from './engine/sim';
import type { Contract } from './engine/instruments';
import type { Side } from './engine/types';

export type InstrumentTab = 'Futures' | 'Physical' | 'Swaps' | 'Freight' | 'Storage';
export type BottomTab = 'Deals' | 'Exposure' | 'Charts' | 'Messenger';

interface Ticket { side: Side; product: string; contract: Contract }

interface UiState {
  engine: SimEngine | null;
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

  login(user: string, team: string): void;
  bump(): void;
  set(partial: Partial<UiState>): void;
}

/** Subscribe to engine ticks and return the engine. Use in every component reading engine state. */
export function useEngine(): SimEngine {
  useUi((s) => s.version);
  return useUi((s) => s.engine)!;
}

export const useUi = create<UiState>((set) => ({
  engine: null,
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
  login: (user, team) =>
    set({ engine: new SimEngine({ seed: 42, user, team: team || user }) }),
  bump: () => set((s) => ({ version: s.version + 1 })),
  set: (partial) => set(partial),
}));
