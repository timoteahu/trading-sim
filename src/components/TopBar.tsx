import { useState } from 'react';
import { TRADING_DAYS, formatGameDate } from '../engine/calendar';
import { TICKS_PER_DAY } from '../engine/sim';
import { fmtBbl, fmtUsd } from '../engine/format';
import { useUi, useEngine } from '../store';

const STATUS_LABEL: Record<string, string> = {
  awaiting: 'Awaiting Market Open', open: 'Market Open', paused: 'Paused',
  finished: 'Finished', disconnected: 'Disconnected',
};

function arcPath(cx: number, cy: number, r: number, frac: number) {
  const f = Math.min(Math.max(frac, 0), 0.9999);
  const a = -Math.PI / 2 + f * 2 * Math.PI;
  const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
  const large = f > 0.5 ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x} ${y}`;
}

export function DualGauge({ outer, inner }: { outer: number; inner: number }) {
  return (
    <svg width="46" height="46" className="gauge"><title>Simulation / day progress</title>
      <circle cx="23" cy="23" r="20" fill="none" stroke="#262b33" strokeWidth="4" />
      <circle cx="23" cy="23" r="13" fill="none" stroke="#262b33" strokeWidth="3" />
      <path d={arcPath(23, 23, 20, outer)} fill="none" stroke="#4f9cf0" strokeWidth="4" />
      <path d={arcPath(23, 23, 13, inner)} fill="none" stroke="#3ecf6e" strokeWidth="3" />
    </svg>
  );
}

const BRIEF_TEXT = `Junior Trader — European North Sea crude team.

Your book carries physical North Sea crude cargoes priced against front-month Brent.

Objectives:
1. Hedge the physical book by close of business each pricing day using front month MAY Brent futures. Carrying outright exposure overnight is a compliance mark.
2. You may run a point-of-view (POV) position in JUN Brent only, up to 100 lots net. MAY is reserved for hedging.
3. Manage P&L. If your book loss reaches $1,000,000 the stop loss triggers: flatten all POV positions and inform Control Room via Messenger, then resume.

Unit: 1 lot = 1,000 bbl.
Simulation: 10 trading days, 6 minutes per day. News and physical deals arrive throughout the day — check the News panel and Messenger, and reply promptly to the Trading Manager.`;

export default function TopBar() {
  const engine = useEngine();
  const [briefOpen, setBriefOpen] = useState(false);
  const pnl = engine.totalPnl();
  const exposure = engine.totalExposureBbl();
  const totalTicks = TRADING_DAYS.length * TICKS_PER_DAY;
  const elapsed = engine.dayIndex * TICKS_PER_DAY + engine.tickOfDay;
  const povBreach = Math.abs(engine.positions.get('BRENT:JUN')?.qty ?? 0) > 100;

  return (
    <div className="topbar">
      <div className="summary-box">
        <div className="summary-col">
          <div className="lbl">Profit ($)</div>
          <div className={`val ${pnl < 0 ? 'neg' : ''}`}>{fmtUsd(pnl)}</div>
        </div>
        <div className="summary-col">
          <div className="lbl">Exposure (BBL)</div>
          <div className={`val hl ${exposure < 0 ? 'neg' : ''}`}>{fmtBbl(exposure)}</div>
        </div>
      </div>
      <div className="summary-box">
        <div className="summary-col">
          <div className="lbl">Team</div>
          <div className="val" style={{ fontSize: 13 }}>{engine.team}</div>
        </div>
        <div className="summary-col">
          <div className="lbl">User</div>
          <div className="val" style={{ fontSize: 13 }}>{engine.user}</div>
        </div>
      </div>
      {povBreach && (
        <div style={{ color: '#ff6b6b', alignSelf: 'center', fontWeight: 700 }}>
          POV LIMIT BREACHED — JUN Brent
        </div>
      )}
      <div className="top-right">
        <button className="btab" onClick={() => setBriefOpen(true)}
          style={{ border: '1px solid #333a44', color: '#4f9cf0' }}>Brief</button>
        {briefOpen && (
          <div className="ticket-overlay" onClick={() => setBriefOpen(false)}>
            <div className="ticket" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
              <div className="ticket-head" style={{ background: '#14406e' }}>EXERCISE BRIEF</div>
              <div className="ticket-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {BRIEF_TEXT}
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="btn-cancel" onClick={() => setBriefOpen(false)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
        <span className={`status-pill ${engine.status}`}>{STATUS_LABEL[engine.status]}</span>
        <a className="logout-link" href="/" onClick={(e) => { e.preventDefault(); location.reload(); }}>Logout</a>
        <span className="game-date">{formatGameDate(TRADING_DAYS[engine.dayIndex])}</span>
        <DualGauge outer={elapsed / totalTicks} inner={engine.tickOfDay / TICKS_PER_DAY} />
      </div>
    </div>
  );
}
