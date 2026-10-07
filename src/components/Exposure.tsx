import { CONTRACTS, ALL_PRODUCTS, instrumentId, LOT_BBL } from '../engine/instruments';
import { TRADING_DAYS, formatShortDate } from '../engine/calendar';
import { fmtBbl } from '../engine/format';
import type { Deal } from '../engine/types';
import type { SimEngine } from '../engine/sim';
import { useUi, useEngine } from '../store';

function hedgeText(lots: number): string {
  if (Math.abs(lots) < 0.5) return '—';
  return `${lots > 0 ? 'Buy' : 'Sell'} ${fmtBbl(Math.abs(lots))} lots`;
}

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
  const physByGrade = engine.physicalExposureByGrade();
  const profile = engine.hedgingProfile();
  const today = TRADING_DAYS[engine.dayIndex];

  return (
    <div className="exposure">
      <h4>Outright Exposure (BBL)</h4>
      <table className="grid">
        <thead>
          <tr><th>Product</th><th>Total</th>{CONTRACTS.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {ALL_PRODUCTS.filter((p) => (byProduct.get(p.key) ?? 0) !== 0).map((p) => (
            <tr key={p.key}>
              <td>{p.name}</td>
              <td>{fmtBbl(byProduct.get(p.key) ?? 0)}</td>
              {CONTRACTS.map((c) => <td key={c}>{fmtBbl(ex.get(instrumentId(p.key, c)) ?? 0)}</td>)}
            </tr>
          ))}
          {[...physByGrade.entries()].filter(([, v]) => v !== 0).map(([g, v]) => (
            <tr key={g}><td>{g} (physical)</td><td>{fmtBbl(v)}</td>
              <td colSpan={3} style={{ color: '#8a93a0' }}>priced to date</td></tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td>Total</td><td>{fmtBbl(total)}</td><td colSpan={3}></td>
          </tr>
        </tbody>
      </table>

      <h4>Hedging Profile</h4>
      <div className="hedging-nav">
        <button onClick={() => setHedgingDay?.(Math.max(0, hedgingDay - 1))}>◀</button>
        <span>Day {Math.min(hedgingDay + 1, profile.length || 1)} of {profile.length}: {profile[hedgingDay] ? formatShortDate(profile[hedgingDay].date) : '—'}</span>
        <button onClick={() => setHedgingDay?.(Math.min(profile.length - 1, hedgingDay + 1))}>▶</button>
      </div>
      <table className="grid">
        <thead>
          <tr><th>Date</th><th>Cargoes pricing</th><th>Net pricing</th><th>Hedge required</th>
            <th>Priced?</th><th>Priced to date</th><th>Hedges on</th><th>Net outright</th></tr>
        </thead>
        <tbody>
          {profile.map((r, i) => {
            const isToday = r.date === today;
            return (
              <tr key={r.date} style={isToday ? { background: '#1c2f4d' } : i === hedgingDay ? { background: '#181f2b' } : undefined}>
                <td>{formatShortDate(r.date)}{isToday ? ' •' : ''}</td>
                <td>{r.byCargo.length
                  ? r.byCargo.map((b) => `${b.grade} ${b.side} ${fmtBbl(Math.abs(b.pricingBbl) / 1000)}k`).join(', ')
                  : '—'}</td>
                <td>{fmtBbl(r.pricingNetBbl)}</td>
                <td data-testid={`hedge-req-${r.date}`}>{hedgeText(r.hedgeRequiredLots)}</td>
                <td>{r.fixed ? 'Yes' : r.byCargo.length ? 'No' : '—'}</td>
                <td>{fmtBbl(r.cumPricedExposureBbl)}</td>
                <td>{fmtBbl(r.hedgesBbl)}</td>
                <td>{fmtBbl(r.netOutrightBbl)}</td>
              </tr>
            );
          })}
          {!profile.length && <tr><td colSpan={8}>No remaining pricing days</td></tr>}
        </tbody>
      </table>
      <div style={{ color: '#8a93a0', marginTop: 4 }}>
        Game day: {formatShortDate(today)} — hedge required shows the lots of MAY Brent to trade at each day's close.
      </div>
    </div>
  );
}

export default function ExposureTab() {
  const engine = useEngine();
  const { showSelectedOnly, hedgingDay, set } = useUi();
  const deals = showSelectedOnly ? engine.deals.filter((d) => d.selected) : undefined;
  return <ExposureTable engine={engine} deals={deals} hedgingDay={hedgingDay}
    setHedgingDay={(n) => set({ hedgingDay: n })} />;
}
