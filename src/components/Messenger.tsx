import { useUi } from '../store';

export default function Messenger() {
  const engine = useUi((s) => s.engine)!;
  useUi((s) => s.version);
  const { activeThread, msgInputs, set, bump } = useUi();
  const threads = ['Control Room', 'Group',
    ...new Set(engine.messages.map((m) => m.thread))].filter((v, i, a) => a.indexOf(v) === i);
  const msgs = engine.messages.filter((m) => m.thread === activeThread);
  const input = msgInputs[activeThread] ?? '';

  return (
    <div className="messenger">
      <div className="threads">
        {threads.map((t) => (
          <div key={t} className={`thread ${t === activeThread ? 'active' : ''}`}
            onClick={() => set({ activeThread: t })}>{t}</div>
        ))}
      </div>
      <div className="chat">
        <div className="chat-log">
          {msgs.map((m) => (
            <div key={m.id} className={`bubble ${m.mine ? 'mine' : ''}`}>
              <div>{m.text}</div>
              <div className="meta">{m.from} · {m.ts}</div>
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input data-testid="msg-input" placeholder={`Message ${activeThread}`} value={input}
            onChange={(e) => set({ msgInputs: { ...msgInputs, [activeThread]: e.target.value } })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input.trim()) {
                engine.sendMessage(activeThread, input.trim());
                set({ msgInputs: { ...msgInputs, [activeThread]: '' } });
                bump();
              }
            }} />
          <button data-testid="msg-send" onClick={() => {
            if (!input.trim()) return;
            engine.sendMessage(activeThread, input.trim());
            set({ msgInputs: { ...msgInputs, [activeThread]: '' } });
            bump();
          }}>Send</button>
        </div>
      </div>
    </div>
  );
}
