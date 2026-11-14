import { expect, test, type Page } from '@playwright/test';

const URL_GRIDSHOT = '/en/gridshot/?test=1';

async function open(page: Page): Promise<void> {
  await page.goto(URL_GRIDSHOT);
  await page.waitForFunction(() => Boolean(window.__fl));
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
}

async function startRun(page: Page, seed = 424242, durationMs = 15_000): Promise<void> {
  await page.evaluate(
    (args) => window.__fl!.start({ seed: args.seed, durationMs: args.durationMs }),
    { seed, durationMs },
  );
  await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('countdown');
  await page.evaluate(() => window.__fl!.advance(3000));
  await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('playing');
}

test.describe('Gridshot', () => {
  test('starts, registers hits and misses, and lands on the results screen', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await open(page);
    await startRun(page);

    const size = await page.evaluate(() => window.__fl!.size());
    expect(size.w).toBeGreaterThan(200);
    expect(size.h).toBeGreaterThan(150);

    await page.evaluate(() => {
      const fl = window.__fl!;
      for (let i = 0; i < 6; i++) {
        const targets = fl.targets();
        const target = targets[i % targets.length]!;
        fl.tap(target.x, target.y, 40 + i * 20);
        fl.advance(140);
      }
    });

    const afterHits = await page.evaluate(() => window.__fl!.hud());
    expect(afterHits.hits).toBe(6);
    expect(afterHits.attempts).toBe(6);
    expect(afterHits.score).toBeGreaterThan(0);

    await page.evaluate(() => {
      window.__fl!.tap(3, 3);
      window.__fl!.advance(140);
    });

    const afterMiss = await page.evaluate(() => window.__fl!.hud());
    expect(afterMiss.attempts).toBe(7);
    expect(afterMiss.accuracy).toBeCloseTo(6 / 7, 2);

    await page.evaluate(() => window.__fl!.advance(20_000));
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('finished');

    const result = await page.evaluate(() => window.__fl!.result());
    expect(result).not.toBeNull();
    expect(result!.hits).toBe(6);
    expect(result!.misses).toBe(1);
    expect(result!.seed).toBe(424242);
    expect(result!.avgTimeToTarget).toBeGreaterThan(0);

    await expect(page.getByRole('heading', { name: /Run complete|New personal best/ })).toBeVisible();
    await expect(page.getByText('Avg time to target')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();

    // Progress is persisted locally.
    const stored = await page.evaluate(() => localStorage.getItem('flicklab.runs.v1'));
    expect(stored).toContain('424242');
    expect(consoleErrors).toEqual([]);
  });

  test('a tapped target respawns elsewhere and the run is replayable', async ({ page }) => {
    await open(page);
    await startRun(page, 20260101);

    const before = await page.evaluate(() => window.__fl!.targets().map((t) => `${t.x}:${t.y}`));
    await page.evaluate(() => {
      const target = window.__fl!.targets()[0]!;
      window.__fl!.tap(target.x, target.y);
      window.__fl!.advance(200);
    });
    const after = await page.evaluate(() => window.__fl!.targets().map((t) => `${t.x}:${t.y}`));

    expect(after).toHaveLength(3);
    expect(after).not.toEqual(before);

    await page.evaluate(() => window.__fl!.advance(20_000));
    const seed = await page.evaluate(() => window.__fl!.result()!.seed);
    expect(seed).toBe(20260101);
  });

  test('pauses, resumes and restarts from the keyboard', async ({ page }) => {
    await open(page);
    await startRun(page);

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('paused');
    await expect(page.getByRole('button', { name: 'Resume run' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('playing');

    const firstSeed = await page.evaluate(() => window.__fl!.gameState());

    await page.keyboard.press('r');
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('countdown');
    expect(firstSeed).toBe('running');
  });

  test('difficulty changes the target size', async ({ page }) => {
    await open(page);

    await page.getByRole('button', { name: 'Easy' }).click();
    const easyRadius = await page.evaluate(() => window.__fl!.targets()[0]!.r);

    await page.getByRole('button', { name: 'Hard' }).click();
    const hardRadius = await page.evaluate(() => window.__fl!.targets()[0]!.r);

    expect(easyRadius).toBeGreaterThan(hardRadius * 1.5);
  });

  test('canvas backing store follows device pixel ratio', async ({ page }) => {
    await open(page);
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      return {
        cssW: canvas.clientWidth,
        pxW: canvas.width,
        dpr: window.devicePixelRatio,
      };
    });
    expect(metrics.pxW).toBeGreaterThanOrEqual(Math.round(metrics.cssW * Math.min(metrics.dpr, 3)) - 2);
  });
});
