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

export default function TopBar() {
  const engine = useEngine();
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
        <span className={`status-pill ${engine.status}`}>{STATUS_LABEL[engine.status]}</span>
        <a className="logout-link" href="/" onClick={(e) => { e.preventDefault(); location.reload(); }}>Logout</a>
        <span className="game-date">{formatGameDate(TRADING_DAYS[engine.dayIndex])}</span>
        <DualGauge outer={elapsed / totalTicks} inner={engine.tickOfDay / TICKS_PER_DAY} />
      </div>
    </div>
  );
}
