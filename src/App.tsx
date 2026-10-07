import { useEffect, useRef, useState } from 'react';
import { useUi } from './store';
import TopBar from './components/TopBar';
import MarketGrid from './components/MarketGrid';
import BottomPanel from './components/BottomPanel';
import DealTicket from './components/DealTicket';
import ControlBar from './components/ControlBar';
import ExposurePopup from './components/ExposurePopup';

function Login() {
  const login = useUi((s) => s.login);
  const [user, setUser] = useState('');
  const [team, setTeam] = useState('');
  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={(e) => { e.preventDefault(); if (user.trim()) login(user.trim(), team.trim() || user.trim()); }}>
        <h1>Smart Market Trading Simulator</h1>
        <h2>Smart Global — European North Sea Crude</h2>
        <label>Username
          <input data-testid="login-user" value={user} autoFocus
            onChange={(e) => { setUser(e.target.value); if (!team) setTeam(e.target.value); }} />
        </label>
        <label>Team
          <input data-testid="login-team" value={team} onChange={(e) => setTeam(e.target.value)} />
        </label>
        <button className="btn-primary" data-testid="login-enter" type="submit">Enter Simulation</button>
      </form>
    </div>
  );
}

export default function App() {
  const engine = useUi((s) => s.engine);
  const bump = useUi((s) => s.bump);
  const isPopup = new URLSearchParams(location.search).get('popup') === 'exposure';
  const seenToasts = useRef(0);
  const [toasts, setToasts] = useState<string[]>([]);

  useEffect(() => {
    if (!engine || isPopup) return;
    let timer: number;
    const loop = () => {
      engine.tick();
      if (engine.toasts.length > seenToasts.current) {
        const news = engine.toasts.slice(seenToasts.current);
        seenToasts.current = engine.toasts.length;
        setToasts((t) => [...t, ...news]);
        setTimeout(() => setToasts((t) => t.slice(news.length)), 6000);
      }
      bump();
      timer = window.setTimeout(loop, Math.max(16, 1000 / engine.speed));
    };
    timer = window.setTimeout(loop, Math.max(16, 1000 / engine.speed));
    return () => clearTimeout(timer);
  }, [engine, isPopup]);

  if (isPopup) return <ExposurePopup />;
  if (!engine) return <Login />;

  return (
    <div className="app">
      {engine.stopLossHit && (
        <div className="stoploss">STOP LOSS BREACHED — flatten POV positions and inform Control Room</div>
      )}
      <TopBar />
      <MarketGrid />
      <BottomPanel />
      <DealTicket />
      <ControlBar />
      <div className="toasts">
        {toasts.map((t, i) => <div key={i} className="toast">{t}</div>)}
      </div>
    </div>
  );
}
