import { useState } from 'react';
import { useUi, useEngine } from '../store';

export default function ControlBar() {
  const engine = useEngine();
  const { controlOpen, set, bump } = useUi();
  const [seedInput, setSeedInput] = useState(String(engine.scenario.seed));
  if (!controlOpen)
    return <div className="control-bar"><div className="cb-head" onClick={() => set({ controlOpen: true })}>Control ▸</div></div>;
  const st = engine.status;
  return (
    <div className="control-bar">
      <div className="cb-head" onClick={() => set({ controlOpen: false })}>Control ▾</div>
      <div className="cb-body">
        <button data-testid="ctl-start" onClick={() => { engine.start(); bump(); }}
          disabled={st === 'open' || st === 'finished'}>
          {st === 'paused' ? 'Resume' : 'Start'}
        </button>
        <button onClick={() => { engine.pause(); bump(); }} disabled={st !== 'open'}>Pause</button>
        {[1, 10, 60].map((x) => (
          <button key={x} data-testid={`speed-${x}`} className={engine.speed === x ? 'on' : ''}
            onClick={() => { engine.setSpeed(x); bump(); }}>{x}x</button>
        ))}
        <button data-testid="debrief-btn" onClick={() => set({ bottomTab: 'Debrief' })}>Debrief (so far)</button>
      </div>
      <div className="cb-body" style={{ borderTop: '1px solid #3a4149' }}>
        <span style={{ color: '#8a93a0' }}>Seed <b data-testid="seed-label">{engine.scenario.seed}</b></span>
        <input data-testid="seed-input" value={seedInput} onChange={(e) => setSeedInput(e.target.value)}
          style={{ width: 80, background: '#0d0f12', border: '1px solid #333a44', color: '#fff', padding: '2px 6px', borderRadius: 3 }} />
        <button onClick={() => { location.search = `?seed=${encodeURIComponent(seedInput)}`; }}>New scenario</button>
        <button onClick={() => { location.search = `?seed=${Math.floor(Math.random() * 1_000_000)}`; }}>Random</button>
      </div>
    </div>
  );
}
