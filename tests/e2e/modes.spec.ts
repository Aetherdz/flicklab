import { expect, test, type Page } from '@playwright/test';

const MODES = ['flick', 'tracking', 'precision', 'reaction', 'cps'] as const;

async function open(page: Page, mode: string): Promise<void> {
  await page.goto(`/en/${mode}/?test=1`);
  await page.waitForFunction(() => Boolean(window.__fl));
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
}

async function startRun(page: Page, seed: number, durationMs: number): Promise<void> {
  await page.evaluate(
    (args) => window.__fl!.start({ seed: args.seed, durationMs: args.durationMs }),
    { seed, durationMs },
  );
  await page.evaluate(() => window.__fl!.advance(3000));
  await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('playing');
}

async function finish(page: Page): Promise<void> {
  await page.evaluate(() => window.__fl!.advance(70_000));
  await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('finished');
}

test.describe('mode pages', () => {
  for (const mode of MODES) {
    test(`${mode} page renders its server HTML copy`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/en/${mode}/`);
      await expect(page.locator('h1')).toBeVisible();
      const words = await page.locator('.prose').innerText();
      expect(words.split(/\s+/).length).toBeGreaterThan(200);
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('Flick', () => {
  test('hits move the target and the run lands on the results screen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, 'flick');
    await startRun(page, 31337, 15_000);

    const first = await page.evaluate(() => window.__fl!.targets()[0]!);
    await page.evaluate(
      (point) => {
        window.__fl!.tap(point.x, point.y, 120);
        window.__fl!.advance(60);
      },
      first,
    );

    const after = await page.evaluate(() => window.__fl!.targets()[0]!);
    expect(`${after.x}:${after.y}`).not.toBe(`${first.x}:${first.y}`);
    expect(await page.evaluate(() => window.__fl!.hud().hits)).toBe(1);

    await finish(page);
    await expect(page.getByRole('heading', { name: /Run complete|New personal best/ })).toBeVisible();
    await expect(page.getByText('Avg time to target')).toBeVisible();
    await expect(page.locator('.results-grid dd').first()).toContainText('%');
    expect(errors).toEqual([]);
  });
});

test.describe('Tracking', () => {
  test('scores time on target and charts it', async ({ page }) => {
    await open(page, 'tracking');
    await startRun(page, 6060, 15_000);

    await page.evaluate(() => {
      const fl = window.__fl!;
      for (let i = 0; i < 240; i++) {
        const point = fl.targets()[0];
        if (!point) break;
        fl.move(point.x, point.y);
        fl.advance(16);
      }
    });

    const hud = await page.evaluate(() => window.__fl!.hud());
    expect(hud.accuracy).toBeGreaterThan(0.9);
    // Tracking has no hit count; the fourth HUD cell reports time on target.
    await expect(page.locator('.hud-cell dt').filter({ hasText: /^On time$/ })).toBeVisible();

    await finish(page);
    // Four seconds on target out of a fifteen second run.
    expect(await page.evaluate(() => window.__fl!.result()!.onTargetRatio)).toBeGreaterThan(0.2);
    await expect(page.locator('.results-grid dt').filter({ hasText: /^On target$/ })).toBeVisible();
    await expect(page.locator('.results-grid dt').filter({ hasText: 'Time on target' })).toBeVisible();
    await expect(page.locator('.chart-empty')).toBeVisible();
  });
});

test.describe('Precision', () => {
  test('a hit shrinks the target and a miss restores it', async ({ page }) => {
    await open(page, 'precision');
    await startRun(page, 2024, 15_000);

    const startRadius = await page.evaluate(() => window.__fl!.targets()[0]!.r);
    await page.evaluate(() => {
      const point = window.__fl!.targets()[0]!;
      window.__fl!.tap(point.x, point.y, 90);
      window.__fl!.advance(60);
    });
    const shrunk = await page.evaluate(() => window.__fl!.targets()[0]!.r);
    expect(shrunk).toBeLessThan(startRadius);

    await page.evaluate(() => {
      window.__fl!.tap(1, 1, 120);
      window.__fl!.advance(60);
    });
    const restored = await page.evaluate(() => window.__fl!.targets()[0]!.r);
    expect(restored).toBeCloseTo(startRadius, 5);

    await finish(page);
    await expect(page.getByText('Best streak')).toBeVisible();
  });
});

test.describe('Reaction', () => {
  test('five trials finish the run early with a reaction average', async ({ page }) => {
    await open(page, 'reaction');
    await startRun(page, 5150, 60_000);
    await expect(page.locator('.hud-cell dt').filter({ hasText: /^Trial$/ })).toBeVisible();

    for (let trial = 0; trial < 5; trial++) {
      await page.evaluate(() => {
        const fl = window.__fl!;
        let waited = 0;
        while (fl.targets().length === 0 && waited < 6000) {
          fl.advance(50);
          waited += 50;
        }
        const point = fl.targets()[0]!;
        fl.tap(point.x, point.y);
        fl.advance(30);
      });
    }

    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('finished');
    const result = await page.evaluate(() => window.__fl!.result()!);
    expect(result.hits).toBe(5);
    expect(result.misses).toBe(0);
    expect(result.avgTimeToTarget).not.toBeNull();
    expect(result.durationMs).toBe(60_000);

    await expect(page.locator('.results-grid dt').filter({ hasText: 'Average reaction' })).toBeVisible();
    await expect(page.locator('.results-grid dt').filter({ hasText: 'Valid trials' })).toBeVisible();
  });
});

test.describe('CPS', () => {
  test('counts pad clicks and reports the rate', async ({ page }) => {
    await open(page, 'cps');
    await startRun(page, 8008, 5000);

    await page.evaluate(() => {
      const fl = window.__fl!;
      const point = fl.targets()[0]!;
      for (let i = 0; i < 30; i++) {
        fl.tap(point.x, point.y, 100 + i * 90);
        fl.advance(90);
      }
    });

    const hud = await page.evaluate(() => window.__fl!.hud());
    expect(hud.hits).toBe(30);
    expect(hud.accuracy).toBe(1);
    expect(hud.progress?.label).toBe('CPS');

    await finish(page);
    await expect(page.locator('.results-grid dt').filter({ hasText: 'Clicks per second' })).toBeVisible();
  });
});

test('the duration rail follows the mode', async ({ page }) => {
  await open(page, 'cps');
  for (const label of ['1s', '5s', '10s', '30s', '60s']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }

  await open(page, 'reaction');
  await expect(page.getByRole('button', { name: '60s', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Easy' })).toBeVisible();
});
