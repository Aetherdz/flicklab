/**
 * Generates the static home and mode pages for both locales from
 * content/site.json and content/modes[.ar].json.
 *
 * The pages are real HTML with the copy, metadata and JSON-LD in place, so a
 * crawler and a first paint never wait for JavaScript. The game shell is an
 * empty div plus a pre-boot overlay; src/main.ts mounts the interpreter only
 * after the play intent.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRIMARY_CTA_ICON, MODE_ICONS } from './icons.mjs';

const ROOT = join(import.meta.dirname, '..');
/** Canonical origin baked into every page. Override it when the site is served
 *  from another host (previews, a new domain) with SITE_URL=... */
const SITE = (process.env.SITE_URL || 'https://flicklab.vercel.app').replace(/\/+$/, '');

/** GA4 + Cloudflare Web Analytics, shared by every generated page. */
const ANALYTICS = `    <script async src="https://www.googletagmanager.com/gtag/js?id=G-6LBX1C4GZC"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-6LBX1C4GZC');
    </script>
    <script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "4f2f91c8758d4aa7a8b5f4344e3c3ab9"}'></script>
`;

const ORDER = ['gridshot', 'flick', 'tracking', 'precision', 'reaction', 'cps'];
const LOCALES = ['en', 'ar'];

const read = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

/** Card copy is required by the home page and the top navigation; a missing key
 *  used to render the literal string "undefined", so it is a hard failure now. */
const requireCard = (locale, slug, entry) => {
  const missing = ['name', 'card'].filter((key) => typeof entry[key] !== 'string' || !entry[key]);
  if (missing.length) {
    console.error(`missing ${missing.join(' + ')} for ${locale}/${slug} in content/`);
    process.exitCode = 1;
    return false;
  }
  return true;
};
const siteCopy = await read('content/site.json');
const modeCopy = { en: await read('content/modes.json'), ar: await read('content/modes.ar.json') };

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const paragraphs = (items) =>
  items.map((text) => `        <p>${escapeHtml(text)}</p>`).join('\n');

const list = (items) =>
  [
    '        <ul>',
    ...items.map((text) => `          <li>${escapeHtml(text)}</li>`),
    '        </ul>',
  ].join('\n');

const spec = (rows) =>
  [
    '        <dl class="spec">',
    ...rows.flatMap(([term, definition]) => [
      '          <div>',
      `            <dt>${escapeHtml(term)}</dt>`,
      `            <dd>${escapeHtml(definition)}</dd>`,
      '          </div>',
    ]),
    '        </dl>',
  ].join('\n');

const section = (entry) => {
  const parts = [`        <h2>${escapeHtml(entry.h2)}</h2>`];
  if (entry.paragraphs) parts.push(paragraphs(entry.paragraphs));
  if (entry.spec) parts.push(spec(entry.spec));
  if (entry.list) parts.push(list(entry.list));
  return parts.join('\n');
};

/** The card grid is above the fold, so its CSS ships inline with the HTML
 *  instead of waiting for the module bundle. */
const HOME_STYLES = `
      .modes {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1px;
        background: var(--line);
        border: 1px solid var(--line);
        margin-top: 40px;
      }

      .mode-card {
        display: block;
        padding: 22px;
        background: var(--panel);
      }

      .mode-card:hover {
        background: var(--panel-2);
      }

      .mode-card-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }

      .mode-icon {
        width: 24px;
        height: 24px;
        color: var(--accent);
        opacity: 0.9;
        transition: opacity 0.2s ease, transform 0.2s ease;
        flex-shrink: 0;
      }

      .mode-icon.mode-icon--flick,
      .mode-icon.mode-icon--reaction {
        color: var(--hit);
      }

      .mode-card-header:hover .mode-icon {
        opacity: 1;
        transform: scale(1.05);
      }

      .mode-card h2 {
        font-family: var(--font-display);
        font-size: 24px;
        font-weight: 700;
        line-height: 1;
        margin: 0;
      }

      .hero h1 {
        max-width: 20ch;
        font-size: clamp(2.4rem, 5vw, 3.4rem);
      }

      @media (max-width: 900px) {
        .modes {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 600px) {
        .modes {
          grid-template-columns: 1fr;
        }
      }

      .mode-card.is-later {
        opacity: 0.55;
      }

      .mode-card p {
        color: var(--muted);
        margin-top: 8px;
        font-size: 15px;
        line-height: 1.4;
      }

      .mode-card span {
        display: block;
        margin-top: 12px;
        color: var(--accent);
        font-size: 14px;
        font-weight: 500;
      }
`;

const other = (locale) => (locale === 'ar' ? 'en' : 'ar');

/** Arabic pages preload the Arabic subset; Latin pages keep the display face. */
const fontPreloads = (locale) =>
  locale === 'ar'
    ? [
        ['/fonts/ibm-plex-sans-arabic-400-ar.woff2'],
        ['/fonts/ibm-plex-sans-arabic-600-ar.woff2'],
      ]
    : [
        ['/fonts/saira-condensed-700-lat.woff2'],
        ['/fonts/inter-tight-400-lat.woff2'],
      ];

const preloadTags = (locale) =>
  fontPreloads(locale)
    .map(
      ([href]) => `    <link
      rel="preload"
      href="${href}"
      as="font"
      type="font/woff2"
      crossorigin
    />`,
    )
    .join('\n');

const alternates = (path) =>
  [
    ['en', `${SITE}/en${path}`],
    ['ar', `${SITE}/ar${path}`],
    ['x-default', `${SITE}/en${path}`],
  ]
    .map(([lang, href]) => `    <link rel="alternate" hreflang="${lang}" href="${href}" />`)
    .join('\n');

const languageSwitch = (locale, path) => {
  const copy = siteCopy[locale];
  const target = other(locale);
  return `        <a
          class="lang-switch"
          href="/${target}${path}"
          hreflang="${target}"
          lang="${target}"
          title="${escapeHtml(copy.switchTitle)}"
          >${escapeHtml(copy.switchLabel)}</a
        >`;
};

const topbar = (locale, path, crumbs) => {
  const copy = siteCopy[locale];
  return `    <a class="skip-link" href="#main">${escapeHtml(copy.skip)}</a>
    <header class="topbar">
      <div class="page topbar-inner">
        <a class="brand" href="/${locale}/">FlickLab<span>.</span></a>
        <nav class="nav" aria-label="${escapeHtml(copy.mainNav)}">
${crumbs}
          ${languageSwitch(locale, path)}
        </nav>
      </div>
    </header>`;
};

const footer = (locale) => {
  const copy = siteCopy[locale];
  return `    <footer class="footer">
      <div class="page footer-inner">
        <span>${escapeHtml(copy.footerLeft)}</span>
        <span>${escapeHtml(copy.footerRight)}</span>
      </div>
    </footer>`;
};

const jsonLd = (locale, slug, page) => {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: `FlickLab — ${page.h1}`,
        url: `${SITE}/${locale}/${slug}/`,
        inLanguage: locale,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any modern browser',
        browserRequirements: 'Requires JavaScript and Canvas 2D',
        description: page.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isPartOf: { '@type': 'WebSite', name: 'FlickLab', url: `${SITE}/${locale}/` },
      },
      {
        '@type': 'FAQPage',
        inLanguage: locale,
        mainEntity: page.faq.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
};

const faq = (locale, items) => {
  const copy = siteCopy[locale];
  return [
    '        <section class="faq">',
    `          <h2>${escapeHtml(copy.questions)}</h2>`,
    ...items.flatMap(([question, answer]) => [
      '          <details>',
      `            <summary>${escapeHtml(question)}</summary>`,
      `            <p>${escapeHtml(answer)}</p>`,
      '          </details>',
    ]),
    '        </section>',
  ].join('\n');
};

const modePage = (locale, slug, entry) => {
  const copy = siteCopy[locale];
  const path = `/${slug}/`;
  const crumbs = `          <a href="/${locale}/${slug}/" aria-current="page">${escapeHtml(entry.h1)}</a>
          <a href="/${locale}/">${escapeHtml(copy.allModes)}</a>`;

  return `<!doctype html>
<html lang="${locale}" dir="${copy.dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(entry.title)}</title>
    <meta name="description" content="${escapeHtml(entry.description)}" />
    <link rel="canonical" href="${SITE}/${locale}/${slug}/" />
${alternates(path)}
    <meta name="theme-color" content="#0b1119" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FlickLab" />
    <meta property="og:locale" content="${locale}" />
    <meta property="og:title" content="${escapeHtml(entry.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(entry.ogDescription)}" />
    <meta property="og:url" content="${SITE}/${locale}/${slug}/" />
    <meta name="twitter:card" content="summary_large_image" />
${preloadTags(locale)}
    <script type="module" src="/src/main.ts"></script>
    <script type="application/ld+json">${jsonLd(locale, slug, entry)}</script>
${ANALYTICS}  </head>
  <body>
${topbar(locale, path, crumbs)}

    <main class="page" id="main">
      <section class="mode-head">
        <div class="mode-title">
          <span class="mode-icon mode-icon--${slug}" aria-hidden="true" focusable="false">
            ${MODE_ICONS[slug] || ''}
          </span>
          <h1>${escapeHtml(entry.h1)}</h1>
        </div>
        <p class="lede">${escapeHtml(entry.lede)}</p>
      </section>

      <div class="game-mount" data-game data-mode="${slug}">
        <div class="overlay overlay-idle">
          <div class="overlay-body">
            <p class="overlay-kicker">${escapeHtml(entry.preboot)}</p>
            <button type="button" class="primary" data-play>${PRIMARY_CTA_ICON}${escapeHtml(copy.cta)}</button>
            <p class="overlay-hint">${escapeHtml(copy.prebootHint)}</p>
            <noscript>
              <p class="overlay-hint">${escapeHtml(copy.noscript)}</p>
            </noscript>
          </div>
        </div>
      </div>

      <article class="prose">
${entry.sections.map(section).join('\n\n')}

${faq(locale, entry.faq)}
      </article>
    </main>

${footer(locale)}
  </body>
</html>
`;
};

const cards = (locale) => {
  const copy = siteCopy[locale];
  const modes = modeCopy[locale];
  return ORDER.map((slug) => {
    const mode = modes[slug];
    const tone = slug === 'flick' || slug === 'reaction' ? ' mode-icon--' + slug : '';
    return `        <a class="mode-card is-live" href="/${locale}/${slug}/">
          <div class="mode-card-header">
            <div class="mode-icon${tone}" aria-hidden="true" focusable="false">
              ${MODE_ICONS[slug] || ''}
            </div>
            <h2>${escapeHtml(mode.name)}</h2>
          </div>
          <p>${escapeHtml(mode.card)}</p>
          <span>${escapeHtml(copy.playNow)}</span>
        </a>`;
  }).join('\n');
};

const homePage = (locale) => {
  const copy = siteCopy[locale];
  const modes = modeCopy[locale];
  const crumbs = ORDER.slice(0, 3)
    .map((slug) => `          <a href="/${locale}/${slug}/">${escapeHtml(modes[slug].name)}</a>`)
    .join('\n');

  return `<!doctype html>
<html lang="${locale}" dir="${copy.dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
    <meta name="description" content="${escapeHtml(copy.description)}" />
    <link rel="canonical" href="${SITE}/${locale}/" />
${alternates('/')}
    <meta name="theme-color" content="#0b1119" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FlickLab" />
    <meta property="og:locale" content="${locale}" />
    <meta property="og:title" content="${escapeHtml(copy.title)}" />
    <meta property="og:description" content="${escapeHtml(copy.description)}" />
    <meta property="og:url" content="${SITE}/${locale}/" />
    <meta name="twitter:card" content="summary_large_image" />
${preloadTags(locale)}
    <script type="module" src="/src/main.ts"></script>
    <style>${HOME_STYLES}    </style>
${ANALYTICS}  </head>
  <body>
${topbar(locale, '/', crumbs)}

    <main class="page" id="main">
      <section class="mode-head hero">
        <h1>${escapeHtml(copy.h1)}</h1>
        <p class="lede">${escapeHtml(copy.lede)}</p>
      </section>

      <div class="game-mount" data-game data-demo data-mode="gridshot">
        <div class="overlay overlay-idle">
          <div class="overlay-body">
            <p class="overlay-kicker">${escapeHtml(copy.heroKicker)}</p>
            <button type="button" class="primary" data-play>${PRIMARY_CTA_ICON}${escapeHtml(copy.cta)}</button>
            <p class="overlay-hint">${escapeHtml(copy.heroHint)}</p>
            <noscript>
              <p class="overlay-hint">${escapeHtml(copy.noscript)}</p>
            </noscript>
          </div>
        </div>
      </div>

      <section class="modes" aria-label="${escapeHtml(copy.modesLabel)}">
${cards(locale)}
      </section>
    </main>

${footer(locale)}
  </body>
</html>
`;
};

let written = 0;

// Validate the copy before touching disk so a bad entry cannot ship a page
// with the literal string "undefined" in it.
let invalid = false;
for (const locale of LOCALES) {
  for (const slug of ORDER) {
    const entry = modeCopy[locale]?.[slug];
    if (entry && !requireCard(locale, slug, entry)) invalid = true;
  }
}
if (invalid) process.exit(1);

for (const locale of LOCALES) {
  const modes = modeCopy[locale];
  if (!siteCopy[locale]) {
    console.error(`missing site copy for ${locale}`);
    process.exitCode = 1;
    continue;
  }

  const homeDir = join(ROOT, locale);
  await mkdir(homeDir, { recursive: true });
  await writeFile(join(homeDir, 'index.html'), homePage(locale));
  written++;

  for (const slug of ORDER) {
    const entry = modes[slug];
    if (!entry) {
      console.error(`missing ${locale} content for ${slug}`);
      process.exitCode = 1;
      continue;
    }
    const dir = join(ROOT, locale, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), modePage(locale, slug, entry));
    written++;
  }
}

const sitemapEntries = LOCALES.flatMap((locale) =>
  [
    `/${locale}/`,
    ...ORDER.map((slug) => `/${locale}/${slug}/`),
  ].map((path) => {
    const alternates = LOCALES.map(
      (alternateLocale) =>
        `    <xhtml:link rel="alternate" hreflang="${alternateLocale}" href="${SITE}/${alternateLocale}${path.slice(locale.length + 1)}" />`,
    ).join('\n');
    const defaultHref = `${SITE}/en${path.slice(locale.length + 1)}`;
    return `  <url>\n    <loc>${SITE}${path}</loc>\n${alternates}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${defaultHref}" />\n  </url>`;
  }),
).join('\n');

await mkdir(join(ROOT, 'public'), { recursive: true });
await writeFile(
  join(ROOT, 'public', 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapEntries}\n</urlset>\n`,
);
await writeFile(
  join(ROOT, 'public', 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
);

console.log(`generated ${written} pages for ${LOCALES.join(' + ')}`);
