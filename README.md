# trading-sim

Browser-based replica of the **Smart Market Trading Simulator (SMS)** by Smart Global —
the environment used for the North Sea crude trading interview exercise. Everything runs
client-side; the "server" is a deterministic in-browser simulation engine.

## Run

```sh
npm install
npm run dev          # http://localhost:5173
```

The app loads straight into the simulator as "Trader". Use the floating **Control**
bar to Start/Pause/Resume and set
speed (1x, 10x, 60x). Each trading day is 6 real minutes at 1x; 10 days total
(Mon 1 Apr – Fri 12 Apr, weekdays).

## Test / verify

```sh
npm run typecheck    # tsc --noEmit
npm run test         # vitest run — engine unit tests
npm run build        # vite build
npx playwright install chromium   # once
npx playwright test               # e2e smoke test
node e2e/screenshot.mjs           # regenerate e2e/screenshots/main.png (dev server on :5199)
```

## Scenario summary

- You are the **Junior Trader**, European North Sea crude team. 1 lot = 1,000 bbl.
- Book opens with **Sold 700 kb Forties @ May Brent −0.10**, pricing **2-1-2 around B/L**
  (B/L est. Fri 5 Apr → pricing days Wed 3, Thu 4, Fri 5, Mon 8, Tue 9; 140 kb/day).
  On day 3 a shipping notice slips the B/L to **Mon 8 Apr** (window becomes
  4, 5, 8, 9, 10 Apr); deals/hedging profile update live.
- Each pricing day close fixes 140 kb at the day's Brent MAY close → outright **short**
  140,000 bbl; hedge by buying MAY Brent futures.
- Futures grid: US (WTI, Gasoline, Heating Oil, Fuel Oil No.6), Europe (Brent, Mogas,
  Gasoil, Fuel Oil), and geographic spreads. Click Bid → Sell ticket, Ask → Buy ticket;
  fills at the live bid/ask when you Submit.
- Exposure tab: outright exposure (bbl) + day-by-day **Hedging Profile**.
  "Show selected" filters both the deals grid *and* the exposure to selected deals
  (replicating the real quirk).
- Charts tab: Select chart → click a grid row; overlay a second row; EMA 5/20 toggles;
  wheel-zoom and drag-pan.
- Messenger: Control Room auto-acknowledges; Trading Manager asks for exposure/TCM
  mid-game; colleague messages late in the game.
- Limits: JUN Brent POV limit 100 lots net (toast warning, still allowed, red banner).
  Stop loss at −$1,000,000 book P&L → persistent red banner + notification.
- Prices: seeded RNG (seed 42), Brent drives the complex, mean-reverting noise plus
  news-driven jumps (~15 scheduled items).

## Layout

```
src/engine/          pure TS sim engine (no React) — rng, calendar, instruments, sim
src/engine/__tests__/vitest unit tests
src/components/      React UI (top bar, market grid, news, deals, exposure, charts,
                     messenger, deal ticket, control bar, exposure popup)
e2e/                 playwright smoke spec + screenshot script
```
