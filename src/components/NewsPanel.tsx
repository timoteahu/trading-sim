import { useUi, useEngine } from '../store';

export default function NewsPanel() {
  const engine = useEngine();
  const { expandedNews, bigFont, set } = useUi();
  return (
    <div className="news-panel">
      <div className="news-head">
        <span>NEWS &amp; NOTIFICATIONS</span>
        <button onClick={() => set({ bigFont: !bigFont })} title="Toggle font size">AA</button>
      </div>
      <div className="news-list">
        {engine.news.map((n) => (
          <div key={n.id} className={`news-item ${bigFont ? 'big' : ''}`}
            onClick={() => { n.unread = false; set({ expandedNews: expandedNews === n.id ? null : n.id }); }}>
            <div className="row">
              <span className={`headline ${n.unread ? 'unread' : ''}`}>
                {n.attachment ? '📎 ' : ''}{n.headline}
              </span>
              <span className="ts">{n.ts}</span>
            </div>
            {expandedNews === n.id && n.body && <div className="body">{n.body}</div>}
          </div>
        ))}
        {engine.news.length === 0 && <div className="empty-note">No news yet</div>}
      </div>
    </div>
  );
}
