import { useEffect, useState } from 'react';
import { fmtBbl } from '../engine/format';
import { formatShortDate, TRADING_DAYS } from '../engine/calendar';
import { EXPO_CHANNEL } from './BottomPanel';

interface Snapshot {
  type: 'snapshot';
  exposure: [string, number][];
  profile: { date: string; pricingVolumeBbl: number; fixed: boolean; fixedPrice: number | null;
    cumPricedExposureBbl: number; hedgesBbl: number; hedgeRequiredBbl: number }[];
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
        <thead><tr><th>Date</th><th>Physical pricing</th><th>Fixed?</th><th>Fixed price</th>
          <th>Cum. exposure</th><th>Hedges</th><th>Hedge required</th></tr></thead>
        <tbody>
          {snap.profile.map((r) => (
            <tr key={r.date}><td>{formatShortDate(r.date)}</td><td>{fmtBbl(r.pricingVolumeBbl)}</td>
              <td>{r.fixed ? 'Yes' : 'No'}</td><td>{r.fixedPrice?.toFixed(2) ?? '—'}</td>
              <td>{fmtBbl(r.cumPricedExposureBbl)}</td><td>{fmtBbl(r.hedgesBbl)}</td>
              <td>{fmtBbl(r.hedgeRequiredBbl)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
