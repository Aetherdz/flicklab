import { expect, test } from '@playwright/test';

async function open(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/en/gridshot/?test=1');
  await page.waitForFunction(() => Boolean(window.__fl));
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
}

async function setRange(page: import('@playwright/test').Page, id: string, value: string) {
  await page.evaluate(
    (args) => {
      const input = document.getElementById(args.id) as HTMLInputElement | null;
      if (!input) throw new Error(`missing #${args.id}`);
      input.value = args.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { id, value },
  );
}

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('changes the crosshair cursor and persists the settings', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('region', { name: 'Settings' })).toBeVisible();

    const before = await page.evaluate(() => document.querySelector('canvas')!.style.cursor);
    expect(before).toContain('data:image/svg');

    await setRange(page, 'set-xhair-size', '14');
    await setRange(page, 'set-xhair-thickness', '4');

    const after = await page.evaluate(() => document.querySelector('canvas')!.style.cursor);
    expect(after).toContain('data:image/svg');
    expect(after).not.toBe(before);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('flicklab.settings.v1')!));
    expect(stored.crosshair.size).toBe(14);
    expect(stored.crosshair.thickness).toBe(4);

    await page.reload();
    await page.waitForFunction(() => Boolean(window.__fl));
    const reloaded = await page.evaluate(() => document.querySelector('canvas')!.style.cursor);
    expect(reloaded).toBe(after);
  });

  test('exports a share code and imports it back', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await setRange(page, 'set-xhair-size', '22');
    await page.getByRole('button', { name: 'Generate' }).click();

    const code = await page.getByLabel('Share code', { exact: true }).inputValue();
    expect(code.startsWith('FL1.')).toBe(true);

    await setRange(page, 'set-xhair-size', '5');
    await page.getByLabel('Import share code').fill(code);
    await page.getByRole('button', { name: 'Apply code' }).click();

    await expect(page.getByText('Settings imported.')).toBeVisible();
    const size = await page.evaluate(
      () => JSON.parse(localStorage.getItem('flicklab.settings.v1')!).crosshair.size,
    );
    expect(size).toBe(22);

    await page.getByLabel('Import share code').fill('not-a-code');
    await page.getByRole('button', { name: 'Apply code' }).click();
    await expect(page.getByText(/not a valid FlickLab settings code/)).toBeVisible();
  });

  test('applies the theme and target colour to the running preview', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.locator('#set-theme').selectOption('graphite');

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('flicklab.settings.v1')!));
    expect(stored.theme).toBe('graphite');
    expect(stored.targetColor).toBe('frost');

    await page.getByRole('button', { name: 'Sand' }).click();
    const color = await page.evaluate(
      () => JSON.parse(localStorage.getItem('flicklab.settings.v1')!).targetColor,
    );
    expect(color).toBe('sand');

    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page.getByRole('region', { name: 'Settings' })).toHaveCount(0);
  });

  test('starts, pauses and resumes with the custom sensitivity', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await setRange(page, 'set-sensitivity', '1.5');
    await page.getByRole('button', { name: 'Close settings' }).click();

    await page.getByRole('button', { name: 'Start run' }).click();
    await page.evaluate(() => window.__fl!.advance(3100));
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('playing');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('paused');
    await expect(page.getByRole('button', { name: 'Resume run' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('playing');
  });
});
