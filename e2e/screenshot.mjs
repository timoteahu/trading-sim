import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto('http://localhost:5199/?seed=42');
await page.getByTestId('ctl-start').click();
await page.getByTestId('speed-10').click();
await page.waitForTimeout(4000); // let some news arrive, prices move

// a couple of deals
await page.getByTestId('ask-BRENT-MAY').click();
await page.getByTestId('ticket-volume').fill('140');
await page.getByTestId('ticket-submit').click();
await page.waitForTimeout(800);
await page.getByTestId('bid-BRENT-JUN').click();
await page.getByTestId('ticket-volume').fill('50');
await page.getByTestId('ticket-submit').click();
await page.waitForTimeout(2000);

await page.screenshot({ path: 'e2e/screenshots/main.png', fullPage: false });
console.log('saved e2e/screenshots/main.png');

// --- exposure.png: fast-forward past Thu 4 Apr close with the 140-lot MAY hedge on ---
await page.getByTestId('speed-60').click();
await page.waitForFunction(
  () => document.body.innerText.includes('FRI 5 APR'),
  undefined,
  { timeout: 120_000 },
);
await page.getByRole('button', { name: 'Exposure', exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'e2e/screenshots/exposure.png', fullPage: false });
console.log('saved e2e/screenshots/exposure.png');

// --- debrief.png: run to Finished at 60x ---
await page.waitForFunction(
  () => document.body.innerText.includes('Finished'),
  undefined,
  { timeout: 120_000 },
);
await page.waitForTimeout(500); // auto-switch to Debrief tab
await page.screenshot({ path: 'e2e/screenshots/debrief.png', fullPage: false });
console.log('saved e2e/screenshots/debrief.png');
await browser.close();
