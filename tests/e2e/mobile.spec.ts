import { devices, expect, test } from '@playwright/test';

test.use({ ...devices['Pixel 7'] });

test('taps register on touch and do not scroll the page', async ({ page }) => {
  await page.goto('/en/gridshot/?test=1');
  await page.waitForFunction(() => Boolean(window.__fl));
  await page.waitForFunction(() => document.querySelector('canvas') !== null);

  await page.evaluate(() => window.__fl!.start({ seed: 8080, durationMs: 30_000 }));
  await page.evaluate(() => window.__fl!.advance(3000));
  await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('playing');

  await page.locator('canvas').scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();

  const target = await page.evaluate(() => window.__fl!.targets()[0]!);
  await page.touchscreen.tap(box!.x + target.x, box!.y + target.y);
  await page.waitForTimeout(80);
  await page.evaluate(() => window.__fl!.advance(120));

  const hud = await page.evaluate(() => window.__fl!.hud());
  expect(hud.hits).toBe(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});
