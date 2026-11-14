/**
 * Captures the screenshots used by README.md into docs/screenshots/.
 *
 * Run it against the dev server, because the scripted bridge (`?test=1`) only
 * exists in dev builds:
 *
 *   pnpm dev --port 4173 --strictPort &
 *   node scripts/screenshots.mjs
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:4173';
const OUT = join(import.meta.dirname, '..', 'docs', 'screenshots');

const DESKTOP = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

async function openHome(browser, locale, viewport = DESKTOP) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/${locale}/`);
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
  // Let fonts and the attract field settle.
  await page.waitForTimeout(1200);
  return page;
}

async function openMode(browser, path, viewport = DESKTOP) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${BASE}${path}?test=1`);
  await page.waitForFunction(() => Boolean(window.__fl));
  // ?test=1 mounts the shell on load so specs can drive it without a click.
  await page.waitForFunction(() => document.querySelector('.field canvas') !== null);
  return page;
}

async function runSome(page) {
  await page.evaluate(() => {
    const fl = window.__fl;
    fl.start({ seed: 20261114, durationMs: 60_000 });
    fl.advance(3200);
    for (let i = 0; i < 11; i++) {
      const targets = fl.targets();
      const target = targets[i % targets.length];
      fl.tap(target.x, target.y, 900 + i * 420);
      fl.advance(380);
    }
  });
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), animations: 'disabled' });
  console.log(`wrote docs/screenshots/${name}`);
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);

try {
  if (want('home-en')) {
    const home = await openHome(browser, 'en');
    await shot(home, 'home-en.png');
    await home.close();
  }

  if (want('home-ar')) {
    const arabic = await openHome(browser, 'ar');
    await shot(arabic, 'home-ar.png');
    await arabic.close();
  }

  if (want('home-phone')) {
    const phone = await openHome(browser, 'en', PHONE);
    await shot(phone, 'home-phone.png');
    await phone.close();
  }

  if (want('home-ar-phone')) {
    const phone = await openHome(browser, 'ar', PHONE);
    await shot(phone, 'home-ar-phone.png');
    await phone.close();
  }

  if (want('gridshot-en') || want('settings-en') || want('results-en')) {
    const game = await openMode(browser, '/en/gridshot/');
    await runSome(game);
    await shot(game, 'gridshot-en.png');

    await game.locator('.rail-settings').click();
    await game.waitForTimeout(500);
    await shot(game, 'settings-en.png');

    // Close the panel so the results overlay is not hidden behind it.
    await game.locator('.rail-settings').click();
    await game.evaluate(() => window.__fl.advance(60_000));
    await game.waitForTimeout(700);
    await shot(game, 'results-en.png');
    await game.close();
  }
} finally {
  await browser.close();
}
