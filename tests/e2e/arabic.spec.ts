import { expect, test, type Page } from '@playwright/test';

async function waitForFL(page: Page): Promise<void> {
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

async function finishRun(page: Page): Promise<void> {
  await page.evaluate(() => window.__fl!.advance(70_000));
  await expect.poll(() => page.evaluate(() => window.__fl!.phase())).toBe('finished');
}

test.describe('Arabic RTL pages', () => {
  test('homepage /ar/ has RTL layout, 6 mode cards, language switch, no overflow, no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/ar/');

    await expect(page.locator('html[lang="ar"][dir="rtl"]')).toBeAttached();
    await expect(page.locator('h1')).toBeVisible();

    const modeCards = page.locator('.mode-card');
    await expect(modeCards).toHaveCount(6);

    const langSwitch = page.locator('a.lang-switch[href="/en/"]');
    await expect(langSwitch).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);

    expect(errors).toEqual([]);
  });

  test('/ar/gridshot/ has Arabic content, JSON-LD inLanguage ar, language switch, Arabic start button', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/ar/gridshot/');

    await expect(page.locator('h1')).toBeVisible();

    const proseText = await page.locator('.prose').innerText();
    expect(proseText.split(/\s+/).length).toBeGreaterThan(200);

    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd).toHaveCount(1);
    const jsonContent = await jsonLd.innerText();
    const parsed = JSON.parse(jsonContent);
    expect(parsed['@graph'][0].inLanguage).toBe('ar');

    const langSwitch = page.locator('a.lang-switch[href="/en/gridshot/"]');
    await expect(langSwitch).toBeVisible();

    const startButton = page.locator('button[data-play]');
    await expect(startButton).toBeVisible();
    const buttonText = await startButton.innerText();
    expect(buttonText).toContain('ابدأ');

    expect(errors).toEqual([]);
  });

  test('functional RTL run on /ar/cps/?test=1 advances phases and shows Arabic HUD/results labels', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/ar/cps/?test=1');
    await waitForFL(page);

    await startRun(page, 4242, 10_000);
    await finishRun(page);

    const hudLabels = await page.locator('.hud-cell dt').allInnerTexts();
    const resultsLabels = await page.locator('.results-grid dt').allInnerTexts();

    const hudArabicCount = hudLabels.filter((t) => /[\u0600-\u06FF]/.test(t)).length;
    const resultsArabicCount = resultsLabels.filter((t) => /[\u0600-\u06FF]/.test(t)).length;

    expect(hudArabicCount).toBeGreaterThanOrEqual(3);
    expect(resultsArabicCount).toBeGreaterThanOrEqual(3);

    expect(errors).toEqual([]);
  });
});

test.describe('English regression', () => {
  test('/en/gridshot/ remains LTR with English content and language switch to Arabic', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/en/gridshot/');

    await expect(page.locator('html[lang="en"][dir="ltr"]')).toBeAttached();

    const langSwitch = page.locator('a.lang-switch[href="/ar/gridshot/"]');
    await expect(langSwitch).toBeVisible();

    const startButton = page.locator('button[data-play]');
    await expect(startButton).toBeVisible();
    const buttonText = await startButton.innerText();
    expect(buttonText).toContain('Start run');

    expect(errors).toEqual([]);
  });
});

test.describe('RTL typography', () => {
  test('/ar/gridshot/ uses IBM Plex Sans Arabic font family', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/ar/gridshot/');

    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily).toContain('IBM Plex Sans Arabic');

    expect(errors).toEqual([]);
  });
});