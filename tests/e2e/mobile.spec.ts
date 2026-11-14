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

test('starting a run keeps the clock and the whole field on screen', async ({ page }) => {
  await page.goto('/en/gridshot/?test=1');
  await page.waitForFunction(() => Boolean(window.__fl));

  await page.getByRole('button', { name: 'Start run' }).click();
  await page.evaluate(() => window.__fl!.advance(3200));
  await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('playing');

  const layout = await page.evaluate(() => {
    const hud = document.querySelector('.hud')!.getBoundingClientRect();
    const field = document.querySelector('.field')!.getBoundingClientRect();
    return { hudTop: hud.top, fieldTop: field.top, fieldBottom: field.bottom, viewport: innerHeight };
  });

  // The rail carries the clock, so both it and the playfield must be visible.
  expect(layout.hudTop).toBeGreaterThanOrEqual(0);
  expect(layout.fieldTop).toBeGreaterThanOrEqual(0);
  expect(layout.fieldBottom).toBeLessThanOrEqual(layout.viewport + 1);
});

test('the sheet fits the phone in both locales', async ({ page }) => {
  for (const path of ['/en/gridshot/', '/ar/gridshot/']) {
    await page.goto(path);
    await page.locator('[data-play]').click();
    await page.waitForFunction(() => document.querySelector('.field') !== null);

    const layout = await page.evaluate(() => {
      const field = document.querySelector('.field')!.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        fieldShare: field.width / innerWidth,
        fieldHeight: field.height,
      };
    });

    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.fieldShare).toBeGreaterThanOrEqual(0.88);
    expect(layout.fieldHeight).toBeGreaterThanOrEqual(340);
  }
});

test('results actions stay a short reach away', async ({ page }) => {
  await page.goto('/en/gridshot/?test=1');
  await page.waitForFunction(() => Boolean(window.__fl));
  await page.evaluate(() => window.__fl!.start({ seed: 12, durationMs: 5000 }));
  await page.evaluate(() => window.__fl!.advance(2000));
  await page.evaluate(() => window.__fl!.advance(7000));
  await page.waitForSelector('.results-actions');

  const actions = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.results-actions > *')].map((el) => {
      const box = el.getBoundingClientRect();
      return { top: Math.round(box.top), height: Math.round(box.height) };
    }),
  );

  expect(actions.length).toBe(3);
  expect(new Set(actions.map((item) => item.top)).size).toBeLessThanOrEqual(2);
  for (const item of actions) expect(item.height).toBeGreaterThanOrEqual(40);
});
