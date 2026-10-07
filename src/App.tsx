import { useEffect, useRef, useState } from 'react';
import { useUi, useEngine } from './store';
import TopBar from './components/TopBar';
import MarketGrid from './components/MarketGrid';
import BottomPanel from './components/BottomPanel';
import DealTicket from './components/DealTicket';
import ControlBar from './components/ControlBar';
import ExposurePopup from './components/ExposurePopup';

export default function App() {
  const engine = useEngine();
  const bump = useUi((s) => s.bump);
  const isPopup = new URLSearchParams(location.search).get('popup') === 'exposure';
  const seenToasts = useRef(0);
  const [toasts, setToasts] = useState<string[]>([]);

  useEffect(() => {
    if (isPopup) return;
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
