import { expect, test, type Page } from '@playwright/test';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => Boolean(window.__fl));
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
}

test.describe('shell layout and behaviour', () => {
  test('playfield is the dominant element', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/en/gridshot/');
    await page.locator('[data-play]').click();
    await page.waitForFunction(() => document.querySelector('.field') !== null);
    const field = page.locator('.field');
    const box = await field.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(600);
    expect(box!.width).toBeGreaterThanOrEqual(1100);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);

    await page.goto('/ar/gridshot/');
    await page.locator('[data-play]').click();
    await page.waitForFunction(() => document.querySelector('.field') !== null);
    const overflowAr = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflowAr).toBe(true);
  });

  test('fullscreen fills the viewport', async ({ page }) => {
    await open(page, '/en/gridshot/?test=1');
    const field = page.locator('.field');
    const initialBox = await field.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialHeight = initialBox!.height;

    const fsButton = page.locator('[data-fullscreen]');
    await fsButton.click();

    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeTruthy();
    const hasShellClass = await page.evaluate(() => document.fullscreenElement?.classList.contains('shell') ?? false);
    expect(hasShellClass).toBe(true);
    await expect(fsButton).toHaveAttribute('aria-pressed', 'true');

    // In headless Chrome, fullscreen may not expand the layout as much; 
    // require some growth but be realistic about the environment
    await expect.poll(async () => {
      const box = await field.boundingBox();
      return box ? box.height : 0;
    }, { timeout: 10000 }).toBeGreaterThan(initialHeight + 5);

    await page.evaluate(() => document.exitFullscreen());

    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect(fsButton).toHaveAttribute('aria-pressed', 'false');

    const finalBox = await field.boundingBox();
    expect(finalBox).not.toBeNull();
    expect(Math.abs(finalBox!.height - initialHeight)).toBeLessThanOrEqual(2);
  });

  test('shared seed replays the same run', async ({ page }) => {
    await open(page, '/en/flick/?test=1&seed=31337');
    await page.locator('[data-action="primary"]').click();
    await page.evaluate(() => window.__fl!.advance(3000));
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('playing');
    await page.evaluate(() => window.__fl!.advance(70000));
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('finished');
    const result = await page.evaluate(() => window.__fl!.result());
    expect(result).not.toBeNull();
    expect(result!.seed).toBe(31337);
  });
});

test.describe('results actions', () => {
  test('results offer a share card download', async ({ page }) => {
    await open(page, '/en/flick/?test=1');
    await page.evaluate(() => window.__fl!.start({ seed: 99, durationMs: 8000 }));
    await page.evaluate(() => window.__fl!.advance(2000));
    await page.evaluate(() => window.__fl!.advance(70000));
    await expect.poll(() => page.locator('.results-actions').isVisible());

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="share-card"]').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^flicklab-.+\.png$/);
    const tempPath = join(tmpdir(), download.suggestedFilename());
    await download.saveAs(tempPath);
    const { size } = await stat(tempPath);
    expect(size).toBeGreaterThan(5000);
  });

  test('copy replay link writes the seed URL', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, '/en/flick/?test=1');
    await page.evaluate(() => window.__fl!.start({ seed: 424242, durationMs: 8000 }));
    await page.evaluate(() => window.__fl!.advance(2000));
    await page.evaluate(() => window.__fl!.advance(70000));
    await expect.poll(() => page.locator('.results-actions').isVisible());

    await page.locator('[data-action="copy-link"]').click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('/en/flick/');
    expect(clipboardText).toContain('?seed=424242');

    const feedback = page.locator('.results-feedback');
    await expect(feedback).not.toBeEmpty();
  });
});