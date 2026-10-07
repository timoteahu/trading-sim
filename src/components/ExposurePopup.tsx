import { useEffect, useState } from 'react';
import { fmtBbl } from '../engine/format';
import { formatShortDate, TRADING_DAYS } from '../engine/calendar';
import { EXPO_CHANNEL } from './BottomPanel';

interface Snapshot {
  type: 'snapshot';
  exposure: [string, number][];
  profile: { date: string;
    byCargo: { cargoId: number; grade: string; side: string; pricingBbl: number }[];
    pricingNetBbl: number; hedgeRequiredLots: number; fixed: boolean;
    cumPricedExposureBbl: number; hedgesBbl: number; netOutrightBbl: number }[];
  day: number;
}

export default function ExposurePopup() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    const ch = new BroadcastChannel(EXPO_CHANNEL);
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'snapshot') setSnap(e.data); };
    ch.addEventListener('message', onMsg);
    const close = () => { ch.postMessage({ type: 'closed' }); };
    window.addEventListener('beforeunload', close);
    window.addEventListener('pagehide', close);
    return () => { close(); ch.close(); };
  }, []);
  if (!snap) return <div style={{ padding: 20 }}>Waiting for exposure sheet…</div>;
  const total = snap.exposure.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="exposure" style={{ background: '#0d0f12', minHeight: '100vh' }}>
      <h4>Outright Exposure (BBL) — {formatShortDate(TRADING_DAYS[snap.day])}</h4>
      <table className="grid">
        <thead><tr><th>Instrument</th><th>Exposure (bbl)</th></tr></thead>
        <tbody>
          {snap.exposure.map(([id, v]) => (
            <tr key={id}><td>{id}</td><td>{fmtBbl(v)}</td></tr>
          ))}
          <tr style={{ fontWeight: 700 }}><td>Total</td><td>{fmtBbl(total)}</td></tr>
        </tbody>
      </table>
      <h4>Hedging Profile</h4>
      <table className="grid">
        <thead><tr><th>Date</th><th>Cargoes pricing</th><th>Net pricing</th><th>Hedge required</th>
          <th>Priced?</th><th>Priced to date</th><th>Hedges on</th><th>Net outright</th></tr></thead>
        <tbody>
          {snap.profile.map((r) => (
            <tr key={r.date}><td>{formatShortDate(r.date)}</td>
              <td>{r.byCargo.map((b) => `${b.grade} ${b.side} ${fmtBbl(Math.abs(b.pricingBbl) / 1000)}k`).join(', ') || '—'}</td>
              <td>{fmtBbl(r.pricingNetBbl)}</td>
              <td>{Math.abs(r.hedgeRequiredLots) < 0.5 ? '—'
                : `${r.hedgeRequiredLots > 0 ? 'Buy' : 'Sell'} ${fmtBbl(Math.abs(r.hedgeRequiredLots))} lots`}</td>
              <td>{r.fixed ? 'Yes' : r.byCargo.length ? 'No' : '—'}</td>
              <td>{fmtBbl(r.cumPricedExposureBbl)}</td><td>{fmtBbl(r.hedgesBbl)}</td>
              <td>{fmtBbl(r.netOutrightBbl)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
