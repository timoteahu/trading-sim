import { useUi, useEngine } from '../store';

export default function ControlBar() {
  const engine = useEngine();
  const { controlOpen, set, bump } = useUi();
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
      </div>
    </div>
  );
}
