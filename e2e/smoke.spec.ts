import { test, expect } from '@playwright/test';

test('trade → exposure → messenger', async ({ page }) => {
  await page.goto('/?seed=42');
  await expect(page.getByText('Awaiting Market Open')).toBeVisible();
  await expect(page.getByTestId('seed-label')).toHaveText('42');

  await page.getByTestId('ctl-start').click();
  await expect(page.getByText('Market Open')).toBeVisible();
  await page.getByTestId('speed-60').click();

  // grid prices update live
  await expect
    .poll(async () => page.getByTestId('last-BRENT-MAY').innerText(), { timeout: 10_000 })
    .not.toBe('85.00');
  await expect
    .poll(async () => page.getByTestId('chg-BRENT-MAY').innerText())
    .not.toBe('— 0.00');

  // Buy 140 lots Brent MAY via the Ask cell
  await page.getByTestId('ask-BRENT-MAY').click();
  await expect(page.getByText('BUY')).toBeVisible();
  await page.getByTestId('ticket-volume').fill('140');
  await expect(page.getByText('140 lots = 140,000 bbl — BRENT MAY')).toBeVisible();
  await page.getByTestId('ticket-submit').click();

  // Deal row appears, newest on top (row 0 is the new deal; physical is older)
  const row = page.locator('table.grid tbody tr', { hasText: 'BRENT' }).first();
  await expect(row).toContainText('B');
  await expect(row).toContainText('140');
  await expect(row).toContainText('Filled');

  // Exposure tab shows +140,000 Brent MAY (long futures vs no fixings yet)
  await page.getByRole('button', { name: 'Exposure', exact: true }).click();
  await expect(page.locator('.exposure')).toContainText('140,000');
  await expect(page.locator('.exposure')).toContainText('Hedge required');
  await expect(page.locator('.exposure')).toContainText(/Buy 140 lots|Sell \d+ lots/);

  // Messenger: send to Control Room, expect auto-ack
  await page.getByRole('button', { name: 'Messenger', exact: true }).click();
  await page.getByTestId('msg-input').fill('Outright exposure +140k bbl, TCM flat');
  await page.getByTestId('msg-send').click();
  await expect(page.getByText('Noted, thanks.')).toBeVisible({ timeout: 15_000 });
});
