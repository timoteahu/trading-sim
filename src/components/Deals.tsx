import { fmtBbl, fmtPrice } from '../engine/format';
import { ALL_PRODUCTS, instrumentId, type Contract } from '../engine/instruments';
import type { Deal } from '../engine/types';
import type { SimEngine } from '../engine/sim';
import { useUi, useEngine } from '../store';

function dealPnl(engine: SimEngine, d: Deal): number | null {
  if (d.kind === 'physical' || d.priceDiff == null) return null;
  const prod = ALL_PRODUCTS.find((p) => p.name === d.product)?.key ?? d.product;
  const mid = engine.mid(instrumentId(prod, d.contract as Contract));
  const dir = d.bs === 'B' ? 1 : -1;
  return dir * d.quantityLots * 1000 * (mid - d.priceDiff);
}

export default function Deals() {
  const engine = useEngine();
  const s = useUi();
  const set = s.set;

  const refs = [...new Set(engine.deals.map((d) => d.reference).filter(Boolean))];
  let rows = engine.deals.filter((d) => (!s.onlyMine || d.mine) && (!s.refFilter || d.reference === s.refFilter));
  if (s.showSelectedOnly) rows = rows.filter((d) => d.selected);
  const pages = Math.max(1, Math.ceil(rows.length / s.perPage));
  const page = Math.min(s.page, pages - 1);
  const view = rows.slice(page * s.perPage, (page + 1) * s.perPage);
  const bump = s.bump;

  return (
    <div>
      <div className="deals-toolbar">
        <button onClick={() => set({ showSelectedOnly: !s.showSelectedOnly })} className={s.showSelectedOnly ? 'toggled' : ''}>Show selected</button>
        <button onClick={() => { engine.deals.forEach((d) => (d.selected = false)); set({ showSelectedOnly: false }); bump(); }}>Clear selected</button>
        <button className={s.onlyMine ? 'toggled' : ''} onClick={() => set({ onlyMine: !s.onlyMine })}>Only my trades</button>
        <select value={s.refFilter} onChange={(e) => set({ refFilter: e.target.value })}>
          <option value="">Filter by reference ▾</option>
          {refs.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button disabled>Arb</button>
        <button disabled>Arb</button>
        <button disabled>Storage In</button>
        <button disabled>Storage Out</button>
        <input placeholder="Add reference to deals" value={s.refInput}
          onChange={(e) => set({ refInput: e.target.value })} />
        <button onClick={() => {
          engine.deals.forEach((d) => { if (d.selected) d.reference = s.refInput; });
          set({ refInput: '' }); bump();
        }}>Add Reference</button>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th></th><th>ID</th><th>🕐</th><th>👤</th><th>Counterparty</th><th>Status</th>
            <th>Product</th><th>Contract</th><th>Reference</th><th>B/S</th><th>Quantity</th>
            <th>Price/Diff</th><th>Basis</th><th>PriceFrm</th><th>PriceTo</th><th>Spread</th>
            <th>Formula</th><th>Profit($)</th>
          </tr>
        </thead>
        <tbody>
          {view.map((d) => {
            const pnl = dealPnl(engine, d);
            return (
              <tr key={d.id} className={d.selected ? 'sel' : ''}
                onClick={() => { d.selected = !d.selected; bump(); }}>
                <td><input type="checkbox" checked={d.selected} readOnly /></td>
                <td>{d.id}</td><td>{d.ts.slice(-5)}</td><td>{d.mine ? '👤' : ''}</td>
                <td>{d.counterparty}</td><td>{d.status}</td>
                <td>{d.product}</td><td>{d.contract}</td><td>{d.reference}</td>
                <td className={`bs-${d.bs}`}>{d.bs}</td>
                <td>{d.kind === 'physical' ? fmtBbl(d.quantityBbl) : d.quantityLots}</td>
                <td>{d.priceDiff != null ? fmtPrice(d.priceDiff) : ''}</td>
                <td>{d.basis}</td><td>{d.priceFrm}</td><td>{d.priceTo}</td>
                <td>{d.kind === 'spread' ? 'spread' : ''}</td><td>{d.formula}</td>
                <td>{pnl != null ? Math.round(pnl).toLocaleString('en-US') : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="pager">
        <button onClick={() => set({ page: 0 })}>⏮</button>
        <button onClick={() => set({ page: Math.max(0, page - 1) })}>◀</button>
        <span>Page {page + 1} of {pages}</span>
        <button onClick={() => set({ page: Math.min(pages - 1, page + 1) })}>▶</button>
        <button onClick={() => set({ page: pages - 1 })}>⏭</button>
        <select value={s.perPage} onChange={(e) => set({ perPage: Number(e.target.value), page: 0 })}>
          {[15, 30, 50].map((n) => <option key={n} value={n}>Per Page ({n}) ▾</option>)}
        </select>
      </div>
    </div>
  );
}
