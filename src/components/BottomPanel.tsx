import { useEffect } from 'react';
import Deals from './Deals';
import ExposureTab from './Exposure';
import Charts from './Charts';
import Messenger from './Messenger';
import Debrief from './Debrief';
import { useUi, useEngine, type BottomTab } from '../store';

export const EXPO_CHANNEL = 'sms-exposure';

export default function BottomPanel() {
  const engine = useEngine();
  const { bottomTab, exposurePopped, set } = useUi();

  const tabs: BottomTab[] = (['Deals', 'Exposure', 'Charts', 'Messenger', 'Debrief'] as BottomTab[])
    .filter((t) => (!exposurePopped || (t !== 'Deals' && t !== 'Exposure'))
      && (t !== 'Debrief' || engine.status === 'finished'));

  useEffect(() => {
    if (engine.status === 'finished' && bottomTab !== 'Debrief') set({ bottomTab: 'Debrief' });
  }, [engine.status]);
  const active = tabs.includes(bottomTab) ? bottomTab : tabs[0];

  const popOut = () => {
    const w = window.open(`${location.origin}/?popup=exposure`, 'sms_exposure',
      'width=820,height=600');
    if (!w) return;
    const ch = new BroadcastChannel(EXPO_CHANNEL);
    const send = () => {
      // serialize a snapshot for the popup
      ch.postMessage({
        type: 'snapshot',
        exposure: [...engine.exposure().entries()],
        profile: engine.hedgingProfile(),
        day: engine.dayIndex,
      });
    };
    send();
    const iv = setInterval(send, 1000);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'closed') {
        clearInterval(iv);
        ch.close();
        set({ exposurePopped: false });
      }
    };
    ch.addEventListener('message', onMsg);
    set({ exposurePopped: true });
  };

  return (
    <div className="bottom">
      <div className="bottom-tabs">
        {tabs.map((t) => (
          <button key={t} className={`btab ${active === t ? 'active' : ''}`}
            onClick={() => set({ bottomTab: t })}>{t}</button>
        ))}
        <div className="spacer" />
        <button className="btab" onClick={popOut} disabled={exposurePopped}
          style={{ color: '#4f9cf0' }}>Open Exposure Sheet</button>
      </div>
      <div className="bottom-body">
        {active === 'Deals' && <Deals />}
        {active === 'Exposure' && <ExposureTab />}
        {active === 'Charts' && <Charts />}
        {active === 'Messenger' && <Messenger />}
        {active === 'Debrief' && <Debrief />}
      </div>
    </div>
  );
}
