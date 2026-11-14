/**
 * Captures the screenshots used by README.md into docs/screenshots/.
 *
 * Run it against the dev server, because the scripted bridge (`?test=1`) only
 * exists in dev builds:
 *
 *   pnpm dev --port 4173 --strictPort &
 *   node scripts/screenshots.mjs
 */
import { mkdir, readFile } from 'node:fs/promises';
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

/** The README hero is a composition of the desktop and Arabic phone shots.
 *  Rendering it in the browser keeps it reproducible without an image library. */
async function composeHero(browser) {
  const png = async (name) =>
    `data:image/png;base64,${(await readFile(join(OUT, name))).toString('base64')}`;
  const html = `<!doctype html>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; }
    body {
      width: 1600px; height: 860px; overflow: hidden;
      background: linear-gradient(#0b1119, #0e1822);
      font: 0/0 a;
    }
    .glow {
      position: absolute; inset: 6% 52% 6% 4%;
      background: radial-gradient(closest-side, rgba(26, 44, 60, .95), rgba(26, 44, 60, 0));
      filter: blur(40px);
    }
    .frame { position: absolute; border: 2px solid; overflow: hidden; }
    .desktop {
      left: 52px; top: 30px; width: 1150px; height: 799px;
      border-color: #2c3642; border-radius: 14px;
      box-shadow: 0 26px 60px rgba(0, 0, 0, .55);
    }
    .phone {
      left: 1258px; top: 92px; width: 335px; height: 726px;
      border-color: #3a4654; border-radius: 30px;
      box-shadow: 0 26px 60px rgba(0, 0, 0, .6);
    }
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
  </style>
  <div class="glow"></div>
  <div class="frame desktop"><img src="${await png('home-en.png')}" alt=""></div>
  <div class="frame phone"><img src="${await png('home-ar-phone.png')}" alt=""></div>`;
  const page = await browser.newPage({ viewport: { width: 1600, height: 860 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, 'hero.png') });
  console.log('wrote docs/screenshots/hero.png');
  await page.close();
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

  if (want('hero')) await composeHero(browser);
} finally {
  await browser.close();
}
