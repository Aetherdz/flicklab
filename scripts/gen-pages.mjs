/**
 * Generates the static mode pages in en/<slug>/index.html from content/modes.json.
 *
 * The pages are real HTML with the copy, metadata and JSON-LD in place, so a
 * crawler and a first paint never wait for JavaScript. The game shell is an
 * empty div plus a pre-boot overlay; src/main.ts mounts the interpreter only
 * after the play intent.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SITE = 'https://flicklab.gg';

const ORDER = ['gridshot', 'flick', 'tracking', 'precision', 'reaction', 'cps'];

const content = JSON.parse(await readFile(join(ROOT, 'content', 'modes.json'), 'utf8'));

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

const faq = (items) =>
  [
    '        <section class="faq">',
    '          <h2>Questions</h2>',
    ...items.flatMap(([question, answer]) => [
      '          <details>',
      `            <summary>${escapeHtml(question)}</summary>`,
      `            <p>${escapeHtml(answer)}</p>`,
      '          </details>',
    ]),
    '        </section>',
  ].join('\n');

const jsonLd = (slug, page) => {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: `FlickLab — ${page.h1}`,
        url: `${SITE}/en/${slug}/`,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any modern browser',
        browserRequirements: 'Requires JavaScript and Canvas 2D',
        description: page.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isPartOf: { '@type': 'WebSite', name: 'FlickLab', url: `${SITE}/en/` },
      },
      {
        '@type': 'FAQPage',
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

const page = (slug, entry) => `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(entry.title)}</title>
    <meta name="description" content="${escapeHtml(entry.description)}" />
    <link rel="canonical" href="${SITE}/en/${slug}/" />
    <link rel="alternate" hreflang="en" href="${SITE}/en/${slug}/" />
    <link rel="alternate" hreflang="ar" href="${SITE}/ar/${slug}/" />
    <link rel="alternate" hreflang="x-default" href="${SITE}/en/${slug}/" />
    <meta name="theme-color" content="#0b1119" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FlickLab" />
    <meta property="og:locale" content="en" />
    <meta property="og:title" content="${escapeHtml(entry.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(entry.ogDescription)}" />
    <meta property="og:url" content="${SITE}/en/${slug}/" />
    <meta name="twitter:card" content="summary_large_image" />
    <link
      rel="preload"
      href="/fonts/saira-condensed-700-lat.woff2"
      as="font"
      type="font/woff2"
      crossorigin
    />
    <link
      rel="preload"
      href="/fonts/inter-tight-400-lat.woff2"
      as="font"
      type="font/woff2"
      crossorigin
    />
    <script type="module" src="/src/main.ts"></script>
    <script type="application/ld+json">${jsonLd(slug, entry)}</script>
  </head>
  <body>
    <header class="topbar">
      <div class="page topbar-inner">
        <a class="brand" href="/en/">FlickLab<span>.</span></a>
        <nav class="nav" aria-label="Main">
          <a href="/en/${slug}/" aria-current="page">${escapeHtml(entry.h1)}</a>
          <a href="/en/">All modes</a>
        </nav>
      </div>
    </header>

    <main class="page">
      <section class="mode-head">
        <h1>${escapeHtml(entry.h1)}</h1>
        <p class="lede">${escapeHtml(entry.lede)}</p>
      </section>

      <div class="shell" data-game data-mode="${slug}">
        <div class="overlay overlay-idle">
          <div class="overlay-body">
            <p class="overlay-kicker">${escapeHtml(entry.preboot)}</p>
            <button type="button" class="primary" data-play>Start run</button>
            <p class="overlay-hint">No account, no download. Your scores stay on this device.</p>
            <noscript>
              <p class="overlay-hint">FlickLab needs JavaScript to run the aim trainer.</p>
            </noscript>
          </div>
        </div>
      </div>

      <article class="prose">
${entry.sections.map(section).join('\n\n')}

${faq(entry.faq)}
      </article>
    </main>

    <footer class="footer">
      <div class="page footer-inner">
        <span>FlickLab — aim training in the browser.</span>
        <span>Scores are saved locally on this device.</span>
      </div>
    </footer>
  </body>
</html>
`;

let written = 0;
for (const slug of ORDER) {
  const entry = content[slug];
  if (!entry) {
    console.error(`missing content for ${slug}`);
    process.exitCode = 1;
    continue;
  }
  const dir = join(ROOT, 'en', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), page(slug, entry));
  written++;
}

console.log(`generated ${written} mode pages from content/modes.json`);
