import { useRef } from 'react';
import { ALL_PRODUCTS, CONTRACTS, instrumentId, type ProductDef } from '../engine/instruments';
import { fmtPrice } from '../engine/format';
import { useUi, useEngine } from '../store';
import NewsPanel from './NewsPanel';

const GLYPH = { up: '▲', down: '▼', flat: '—' } as const;

function ProductBlock({ def }: { def: ProductDef }) {
  const engine = useEngine();
  const set = useUi((s) => s.set);
  const chartSelectArmed = useUi((s) => s.chartSelectArmed);
  const chartA = useUi((s) => s.chartA);
  const chartB = useUi((s) => s.chartB);
  const prev = useRef(new Map<string, number>());

  return (
    <div className="product-block">
      <div className="product-head">{def.name}</div>
      <table>
        <thead>
          <tr><th></th><th>Bid</th><th>Ask</th><th>Last</th><th>Change</th></tr>
        </thead>
        <tbody>
          {CONTRACTS.map((c) => {
            const id = instrumentId(def.key, c);
            const q = engine.quote(def.key, c);
            const chg = engine.changeOf(def.key, c);
            const lastSeen = prev.current.get(id) ?? q.mid;
            const flashed = Math.abs(q.mid - lastSeen) > 1e-9;
            prev.current.set(id, q.mid);
            const selected = chartA === id || chartB === id;
            const decimals = ['MOGAS', 'GASOIL', 'FO', 'GAS/MOG', 'HO/GASOIL', 'FO6/FO'].includes(def.key) ? 1 : 2;
            return (
              <tr key={c} className={selected ? 'row-selected-inst' : ''}
                onClick={() => {
                  if (!chartSelectArmed) return;
                  if (!chartA) set({ chartA: id });
                  else if (chartA !== id && !chartB) set({ chartB: id });
                  else set({ chartA: id, chartB: null });
                  set({ chartSelectArmed: false, bottomTab: 'Charts' });
                }}>
                <td>{c}</td>
                <td className={`cell-bid ${flashed ? 'cell-flash' : ''}`} data-testid={`bid-${def.key}-${c}`}
                  onClick={(e) => { e.stopPropagation(); set({ ticket: { side: 'S', product: def.key, contract: c } }); }}>
                  {fmtPrice(q.bid, decimals)}
                </td>
                <td className={`cell-ask ${flashed ? 'cell-flash' : ''}`} data-testid={`ask-${def.key}-${c}`}
                  onClick={(e) => { e.stopPropagation(); set({ ticket: { side: 'B', product: def.key, contract: c } }); }}>
                  {fmtPrice(q.ask, decimals)}
                </td>
                <td className={flashed ? 'cell-flash' : ''} data-testid={`last-${def.key}-${c}`}>{fmtPrice(q.last, decimals)}</td>
                <td className={`chg-${chg.glyph}`} data-testid={`chg-${def.key}-${c}`}>{GLYPH[chg.glyph]} {fmtPrice(Math.abs(chg.diff), decimals)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MarketGrid() {
  const tab = useUi((s) => s.instrumentTab);
  const set = useUi((s) => s.set);
  const tabs = ['Futures', 'Physical', 'Swaps', 'Freight', 'Storage'] as const;
  const cols: ProductDef[][] = [[], [], []];
  for (const p of ALL_PRODUCTS) cols[p.column].push(p);

  return (
    <>
      <div className="inst-tabs">
        {tabs.map((t) => (
          <button key={t} className={`inst-tab ${tab === t ? 'active' : ''}`}
            onClick={() => set({ instrumentTab: t })}>{t}</button>
        ))}
      </div>
      <div className="market">
        <div className="grid-area">
          {tab === 'Futures' ? cols.map((col, i) => (
            <div className="grid-col" key={i}>
              {col.map((p) => <ProductBlock key={p.key} def={p} />)}
            </div>
          )) : (
            <div className="grid-col" style={{ flex: 1 }}>
              <div className="product-block">
                <div className="product-head">{tab}</div>
                <div className="empty-note">No instruments available in this scenario</div>
              </div>
            </div>
          )}
        </div>
        <NewsPanel />
      </div>
    </>
  );
}
