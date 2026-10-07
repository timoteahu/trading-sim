import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto('http://localhost:5199/');
await page.getByTestId('login-user').fill('junior');
await page.getByTestId('login-enter').click();
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
  { timeout: 120_000 },
);
await page.getByRole('button', { name: 'Exposure', exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'e2e/screenshots/exposure.png', fullPage: false });
console.log('saved e2e/screenshots/exposure.png');
await browser.close();
