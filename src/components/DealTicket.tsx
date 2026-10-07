import { useState } from 'react';
import { LOT_BBL, productByKey } from '../engine/instruments';
import { fmtPrice, fmtBbl } from '../engine/format';
import { useUi, useEngine } from '../store';

export default function DealTicket() {
  const engine = useEngine();
  const ticket = useUi((s) => s.ticket);
  const set = useUi((s) => s.set);
  const bump = useUi((s) => s.bump);
  const [lots, setLots] = useState('140');
  if (!ticket) return null;

  const q = engine.quote(ticket.product, ticket.contract);
  const price = ticket.side === 'B' ? q.ask : q.bid;
  const n = parseInt(lots, 10) || 0;
  const def = productByKey(ticket.product);

  return (
    <div className="ticket-overlay" onClick={() => set({ ticket: null })}>
      <div className={`ticket ${ticket.side === 'B' ? 'buy' : 'sell'}`} onClick={(e) => e.stopPropagation()}>
        <div className="ticket-head">{ticket.side === 'B' ? 'BUY' : 'SELL'}</div>
        <div className="ticket-body">
          <div className="row"><span>Product</span><b>{def.name}</b></div>
          <div className="row"><span>Contract</span><b>{ticket.contract}</b></div>
          <div className="row"><span>Price</span><b data-testid="ticket-price">{fmtPrice(price)}</b></div>
          <div className="row">
            <span>Volume (lots)</span>
            <input data-testid="ticket-volume" value={lots} autoFocus
              onChange={(e) => setLots(e.target.value)} />
          </div>
          <div className="recap">{n} lots = {fmtBbl(n * LOT_BBL)} bbl — {def.name} {ticket.contract}</div>
          <div className="actions">
            <button className="btn-cancel" onClick={() => set({ ticket: null })}>Cancel</button>
            <button className="btn-submit" data-testid="ticket-submit" onClick={() => {
              if (n > 0) engine.executeDeal(ticket.product, ticket.contract, ticket.side, n);
              set({ ticket: null, page: 0 });
              bump();
            }}>Submit</button>
          </div>
        </div>
      </div>
    </div>
  );
}
