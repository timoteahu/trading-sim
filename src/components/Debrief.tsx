import { scoreRun } from '../engine/score';
import { fmtBbl, fmtUsd } from '../engine/format';
import { formatShortDate } from '../engine/calendar';
import { useEngine } from '../store';

const pass = (ok: boolean) => ({ color: ok ? '#3ecf6e' : '#ff6b6b', fontWeight: 600 });

export default function Debrief() {
  const engine = useEngine();
  const d = scoreRun(engine);
  return (
    <div className="exposure">
      <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
        <h4>Debrief {d.finished ? '(final)' : '(so far)'}</h4>
        <span style={{ fontSize: 22, fontWeight: 800 }}>Grade: {d.grade}</span>
        <span>TCM: {fmtUsd(d.tcm)}</span>
        {d.bestDay && <span>Best day: {formatShortDate(d.bestDay.date)} ({fmtUsd(d.bestDay.pnl)})</span>}
        {d.worstDay && <span>Worst day: {formatShortDate(d.worstDay.date)} ({fmtUsd(d.worstDay.pnl)})</span>}
      </div>

      <h4>Hedging — {Math.round(d.hedging.score * 100)}% of pricing days hedged; avg overnight outright {fmtBbl(d.hedging.avgAbsOvernightBbl)} bbl</h4>
      <table className="grid">
        <thead><tr><th>Date</th><th>Net outright at close (bbl)</th><th>Hedged?</th><th>Slippage (bbl)</th></tr></thead>
        <tbody>
          {d.hedging.days.map((r) => (
            <tr key={r.date}>
              <td>{formatShortDate(r.date)}</td><td>{fmtBbl(r.netOutrightBbl)}</td>
              <td style={pass(r.hedged)}>{r.hedged ? 'Yes' : 'No'}</td>
              <td>{r.slippageBbl ? fmtBbl(r.slippageBbl) : '—'}</td>
            </tr>
          ))}
          {!d.hedging.days.length && <tr><td colSpan={4}>No pricing days yet</td></tr>}
        </tbody>
      </table>

      <h4>Hedge timing — avg {d.timing.avgMinutesBeforeClose?.toFixed(0) ?? '—'} min before close; early deals: {d.timing.earlyCount}</h4>
      <table className="grid">
        <thead><tr><th>Pricing day</th><th>MAY deals</th><th>Avg min before close</th><th>Early</th></tr></thead>
        <tbody>
          {d.timing.rows.map((r) => (
            <tr key={r.date}>
              <td>{formatShortDate(r.date)}</td><td>{r.deals}</td>
              <td>{r.avgMinutesBeforeClose?.toFixed(0) ?? '—'}</td>
              <td style={pass(r.earlyDeals === 0)}>{r.earlyDeals}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Limits</h4>
      <table className="grid">
        <tbody>
          <tr><td>Max |JUN Brent| position</td>
            <td style={pass(d.pov.maxJunLots <= 100)}>{d.pov.maxJunLots} lots (limit 100)</td></tr>
          <tr><td>POV breaches</td><td style={pass(d.pov.breachCount === 0)}>{d.pov.breachCount}</td></tr>
          <tr><td>Days over/under-hedged in wrong contract</td>
            <td style={pass(d.pov.wrongContractDays === 0)}>{d.pov.wrongContractDays}</td></tr>
        </tbody>
      </table>

      <h4>Stop loss</h4>
      <table className="grid">
        <tbody>
          <tr><td>Breached?</td><td>{d.stopLoss.breached ? 'Yes' : 'No'}</td></tr>
          {d.stopLoss.breached && <>
            <tr><td>POV flattened within 60 ticks</td>
              <td style={pass(!!d.stopLoss.flattenedInTime)}>{d.stopLoss.flattenedInTime ? 'Yes' : 'No'}</td></tr>
            <tr><td>Control Room informed within 60 ticks</td>
              <td style={pass(!!d.stopLoss.informedCR)}>{d.stopLoss.informedCR ? 'Yes' : 'No'}</td></tr>
          </>}
        </tbody>
      </table>

      <h4>Communications</h4>
      <table className="grid">
        <tbody>
          <tr><td>Manager requests answered (&lt;90 ticks)</td>
            <td style={pass(d.comms.answered === d.comms.expected)}>
              {d.comms.answered}/{d.comms.expected}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
