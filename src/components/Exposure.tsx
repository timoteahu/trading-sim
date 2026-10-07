import { CONTRACTS, ALL_PRODUCTS, instrumentId } from '../engine/instruments';
import { TRADING_DAYS, formatShortDate } from '../engine/calendar';
import { fmtBbl } from '../engine/format';
import type { Deal } from '../engine/types';
import type { SimEngine } from '../engine/sim';
import { useUi } from '../store';

/** Exposure table — reused by the bottom tab and the pop-out window. */
export function ExposureTable({ engine, deals, hedgingDay, setHedgingDay }:
  { engine: SimEngine; deals?: Deal[]; hedgingDay: number; setHedgingDay?: (n: number) => void }) {
  const ex = engine.exposure(deals);
  let total = 0;
  for (const v of ex.values()) total += v;
  const byProduct = new Map<string, number>();
  for (const [id, v] of ex) {
    const prod = id.split(':')[0];
    byProduct.set(prod, (byProduct.get(prod) ?? 0) + v);
  }
  const profile = engine.hedgingProfile();

  return (
    <div className="exposure">
      <h4>Outright Exposure (BBL)</h4>
      <table className="grid">
        <thead>
          <tr><th>Product</th><th>Total</th>{CONTRACTS.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {ALL_PRODUCTS.filter((p) => (byProduct.get(p.key) ?? 0) !== 0 || p.key === 'BRENT').map((p) => (
            <tr key={p.key}>
              <td>{p.name}</td>
              <td>{fmtBbl(byProduct.get(p.key) ?? 0)}</td>
              {CONTRACTS.map((c) => <td key={c}>{fmtBbl(ex.get(instrumentId(p.key, c)) ?? 0)}</td>)}
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td>Total</td><td>{fmtBbl(total)}</td><td colSpan={3}></td>
          </tr>
        </tbody>
      </table>

      <h4>Hedging Profile</h4>
      <div className="hedging-nav">
        <button onClick={() => setHedgingDay?.(Math.max(0, hedgingDay - 1))}>◀</button>
        <span>Pricing day {hedgingDay + 1} of {profile.length}: {profile[hedgingDay] ? formatShortDate(profile[hedgingDay].date) : '—'}</span>
        <button onClick={() => setHedgingDay?.(Math.min(profile.length - 1, hedgingDay + 1))}>▶</button>
      </div>
      <table className="grid">
        <thead>
          <tr><th>Date</th><th>Physical pricing (bbl)</th><th>Fixed?</th><th>Fixed price</th>
            <th>Cum. priced exposure</th><th>Hedges placed</th><th>Hedge required</th></tr>
        </thead>
        <tbody>
          {profile.map((r, i) => (
            <tr key={r.date} style={i === hedgingDay ? { background: '#1c2f4d' } : undefined}>
              <td>{formatShortDate(r.date)}</td>
              <td>{fmtBbl(r.pricingVolumeBbl)}</td>
              <td>{r.fixed ? 'Yes' : 'No'}</td>
              <td>{r.fixedPrice?.toFixed(2) ?? '—'}</td>
              <td>{fmtBbl(r.cumPricedExposureBbl)}</td>
              <td>{fmtBbl(r.hedgesBbl)}</td>
              <td>{fmtBbl(r.hedgeRequiredBbl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: '#8a93a0', marginTop: 4 }}>
        Game day: {formatShortDate(TRADING_DAYS[engine.dayIndex])} — hedge required reflects fixings to date.
      </div>
    </div>
  );
}

export default function ExposureTab() {
  const engine = useUi((s) => s.engine)!;
  useUi((s) => s.version);
  const { showSelectedOnly, hedgingDay, set } = useUi();
  const deals = showSelectedOnly ? engine.deals.filter((d) => d.selected || d.kind === 'physical') : undefined;
  return <ExposureTable engine={engine} deals={deals} hedgingDay={hedgingDay}
    setHedgingDay={(n) => set({ hedgingDay: n })} />;
}
