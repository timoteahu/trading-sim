// Candidate walkthrough: plays the sim through the UI at ?seed=1234, 60x.
// Hedges each pricing day near the close, replies to Trading Manager messages,
// holds a 50-lot JUN POV from day 2, then reads the Debrief.
import { chromium } from '@playwright/test';

const MONTH = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
const SHOT = (page, name) => page.screenshot({ path: `e2e/screenshots/${name}` });
const log = (...a) => console.log('[walk]', ...a);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
const page = await context.newPage();

const results = { days: [], replies: 0, pov: null, debrief: null, checks: [] };
const check = (name, ok, detail = '') => {
  results.checks.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
};

async function gameDateText() { return (await page.locator('.game-date').innerText()).trim(); }
function toIso(gd) {
  const m = gd.match(/(\d+)\s+([A-Z]{3})/);
  return `2024-${MONTH[m[2]]}-${m[1].padStart(2, '0')}`;
}
async function summaryVals() {
  const vals = await page.locator('.summary-box').first().locator('.val').allInnerTexts();
  return { profit: vals[0], exposure: vals[1] };
}
async function topNewsClockMinutes() {
  const t = await page.locator('.news-item .ts').first().innerText().catch(() => '');
  const m = t.match(/(\d{2}):(\d{2})$/);
  return m ? (+m[1] - 9) * 60 + +m[2] : 0;
}
async function managerNewsCount() {
  return page.locator('.headline', { hasText: 'Trading Manager: message received' }).count();
}
async function replyToManager() {
  const { profit, exposure } = await summaryVals();
  await page.getByRole('button', { name: 'Messenger', exact: true }).click();
  await page.getByTestId('msg-input').fill(`Outright ${exposure.trim()} bbl, TCM ${profit.trim()}`);
  await page.getByTestId('msg-send').click();
  results.replies++;
  log(`replied to Trading Manager: Outright ${exposure} / TCM ${profit}`);
}
async function trade(product, contract, side, lots) {
  const cell = side === 'B' ? `ask-${product}-${contract}` : `bid-${product}-${contract}`;
  await page.getByTestId(cell).click();
  await page.getByTestId('ticket-volume').fill(String(lots));
  await page.getByTestId('ticket-submit').click();
}
async function openExposureTab() {
  await page.getByRole('button', { name: 'Exposure', exact: true }).click();
}
const NUM = (s) => {
  const m = (s ?? '').match(/^\(?([\d,]+)\)?$/);
  if (!m) return 0;
  const v = parseInt(m[1].replace(/,/g, ''), 10);
  return s.includes('(') ? -v : v;
};
async function todaysRow(iso) {
  const req = page.getByTestId(`hedge-req-${iso}`);
  if (!(await req.count())) return null;
  const tr = page.locator('tr', { has: req });
  const cells = await tr.locator('td').allInnerTexts();
  return {
    cells, hedgeReq: cells[3]?.trim(), pricedToDate: cells[5]?.trim(),
    netOutright: cells[7]?.trim(),
    pricingNetBbl: NUM(cells[2]), netOutrightBbl: NUM(cells[7]),
  };
}

// ---------- 1. load + brief ----------
await page.goto('http://localhost:5199/?seed=1234');
await page.getByText('Awaiting Market Open').waitFor();
check('status Awaiting Market Open', true);
await page.getByRole('button', { name: 'Brief', exact: true }).click();
await page.getByText('Junior Trader — European North Sea crude team.').waitFor();
check('Brief modal shows exercise text', true);
await page.getByRole('button', { name: 'Close' }).click();
await SHOT(page, 'walk-01-start.png');

// ---------- 2-3. play all 10 days ----------
await page.getByTestId('ctl-start').click();
await page.getByTestId('speed-60').click();
log('started at 60x, seed 1234');

let junPovDone = false;
let finished = false;
for (let dayIdx = 0; dayIdx < 10 && !finished; dayIdx++) {
  const gd = await gameDateText();
  const iso = toIso(gd);
  const dayStart = Date.now();

  // wait until near close: est tick >= 325 (wall ~5.4s at 60x) with clock cross-check;
  // reply to Trading Manager messages as soon as they arrive (90-tick window)
  for (;;) {
    const el = (Date.now() - dayStart) / 1000;
    const estTick = el * 60;
    const clockMin = await topNewsClockMinutes();
    while ((await managerNewsCount()) > results.replies) await replyToManager();
    if (estTick >= 325 || clockMin >= 325 || el > 6.4) break;
    await page.waitForTimeout(80);
    const pill = await page.locator('.status-pill').innerText();
    if (pill.trim() === 'Finished') { finished = true; break; }
  }
  if (finished) break;
  // pause so the hedge executes at a deterministic tick (~325-340, inside the
  // ideal last-60-min window) instead of racing the day roll at 60x
  await page.getByRole('button', { name: 'Pause' }).click().catch(() => {});

  // day 2 (index 1): open 50-lot JUN POV (sell)
  if (dayIdx === 1 && !junPovDone) {
    await trade('BRENT', 'JUN', 'S', 50);
    junPovDone = true;
    results.pov = 'sold 50 JUN on day 2';
    log('opened 50-lot JUN POV (sell)');
  }

  // read today's hedging row; trade MAY to zero the post-close physical net
  // (covers today's hedge AND unwinds over-hedge from B/L shifts)
  await openExposureTab();
  const row = await todaysRow(iso);
  const reqText = row?.hedgeReq ?? '—';
  let executed = 'none';
  if (row) {
    const residual = row.netOutrightBbl + row.pricingNetBbl; // physical net after today's fixing
    const lots = Math.round(residual / 1000);
    if (lots !== 0) {
      await trade('BRENT', 'MAY', lots < 0 ? 'B' : 'S', Math.abs(lots));
      executed = `${lots < 0 ? 'Buy' : 'Sell'} ${Math.abs(lots)}`;
    }
    await page.waitForTimeout(150);
    const after = await todaysRow(iso);
    results.days.push({
      day: gd, iso, required: reqText, executed,
      residualBeforeBbl: residual,
      pricedToDate: after?.pricedToDate, netOutright: after?.netOutright,
      clockMin: await topNewsClockMinutes(),
    });
    log(`${gd}: required "${reqText}" -> executed ${executed} lots | pricedToDate ${after?.pricedToDate} | netOutright ${after?.netOutright}`);
  } else {
    results.days.push({ day: gd, iso, required: reqText, executed: 'none' });
    log(`${gd}: no pricing row (${reqText})`);
  }

  // resume and wait for day roll (date text changes) or finish
  await page.getByTestId('ctl-start').click().catch(() => {});
  for (;;) {
    while ((await managerNewsCount()) > results.replies) await replyToManager();
    const pill = (await page.locator('.status-pill').innerText()).trim();
    if (pill === 'Finished') { finished = true; break; }
    if ((await gameDateText()) !== gd) break;
    await page.waitForTimeout(120);
  }
  await SHOT(page, `walk-02-day${dayIdx + 1}.png`).catch(() => {});
}

// ---------- 4. debrief ----------
if (!finished) {
  await page.getByText('Finished', { exact: true }).waitFor({ timeout: 30_000 }).catch(() => {});
}
await page.waitForTimeout(800); // auto-switch to Debrief
await SHOT(page, 'walk-03-debrief.png');

const db = page.locator('.bottom-body');
const debriefText = await db.innerText();
log('debrief text:\n' + debriefText);
const gradeM = debriefText.match(/Grade:\s*([A-F])/i);
const hedgeM = debriefText.match(/(\d+)% of pricing days hedged/i);
const commsM = debriefText.match(/(\d+)\/(\d+)/);
const junM = debriefText.match(/(\d+) lots \(limit 100\)/i);
const wrongM = debriefText.match(/wrong contract\s*\n?\s*(\d+)/i);
const breakM = debriefText.match(/Score breakdown — ([^\n]+)/);
const wrongM2 = debriefText.match(/Days over\/under-hedged in wrong contract\s*(\d+)/i);
results.debrief = {
  breakdown: breakM?.[1] ?? null,
  wrongContractDays: wrongM ? +wrongM[1] : wrongM2 ? +wrongM2[1] : null,
  grade: gradeM?.[1], hedgingPct: hedgeM ? +hedgeM[1] : null,
  comms: commsM ? `${commsM[1]}/${commsM[2]}` : null, maxJun: junM ? +junM[1] : null,
};
log('DEBRIEF:', JSON.stringify(results.debrief));
check('hedging >= 80%', (results.debrief.hedgingPct ?? 0) >= 80, `${results.debrief.hedgingPct}%`);
check('comms 100%', commsM?.[1] === commsM?.[2], results.debrief.comms);
check('no POV breach (maxJun <= 100)', (results.debrief.maxJun ?? 999) <= 100, `max ${results.debrief.maxJun}`);
check('grade A or B', ['A', 'B'].includes(results.debrief.grade), results.debrief.grade);

// ---------- 7. charts (on finished page: full history) ----------
await page.getByRole('button', { name: 'Charts', exact: true }).click();
await page.getByRole('button', { name: 'Select chart' }).click();
// click the contract-month cell (first td) — not a bid/ask cell (those open a ticket)
await page.locator('tr', { has: page.getByTestId('ask-BRENT-MAY') }).locator('td').first().click();
await page.waitForTimeout(300);
const paths1 = await page.locator('.chart-wrap svg path').count();
check('chart renders series', paths1 >= 1, `${paths1} paths`);
await page.getByRole('button', { name: 'Select chart' }).click();
await page.locator('tr', { has: page.getByTestId('ask-BRENT-JUN') }).locator('td').first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'EMA 5' }).click();
await page.getByRole('button', { name: 'EMA 20' }).click();
const paths2 = await page.locator('.chart-wrap svg path').count();
check('overlay + EMAs', paths2 >= 4, `${paths2} paths`);
await SHOT(page, 'walk-04-charts.png');

// ---------- 6. exposure pop-out ----------
const [popup] = await Promise.all([
  context.waitForEvent('page'),
  page.getByRole('button', { name: 'Open Exposure Sheet' }).click(),
]);
await popup.waitForLoadState();
await popup.getByText('Outright Exposure', { exact: false }).waitFor({ timeout: 10_000 });
await popup.screenshot({ path: 'e2e/screenshots/walk-05-popup.png' });
check('exposure popup receives snapshots', true);
const tabsWhilePopped = await page.locator('.btab', { hasText: /^(Deals|Exposure)$/ }).count();
check('Deals/Exposure tabs hidden while popped', tabsWhilePopped === 0, `${tabsWhilePopped}`);
await popup.close();
await page.waitForTimeout(500);
const tabsAfter = await page.locator('.btab', { hasText: /^(Deals|Exposure)$/ }).count();
check('tabs return after popup close', tabsAfter === 2, `${tabsAfter}`);

console.log('\n===== WALKTHROUGH RESULT =====');
console.log(JSON.stringify(results, null, 2));
await browser.close();
