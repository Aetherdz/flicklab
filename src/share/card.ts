import type { ModeId } from '../engine/types';

export interface ShareCardData {
  modeId: ModeId;
  /** Already localised mode name, e.g. "Gridshot" or "اختبار CPS". */
  modeLabel: string;
  score: number;
  /** 0..100, or null when the mode has no accuracy figure. */
  accuracyPct: number | null;
  /** Already localised difficulty label. */
  difficultyLabel: string;
  seed: number;
  isBest: boolean;
  locale: 'en' | 'ar';
  /** Absolute replay URL, printed at the bottom of the card. */
  url: string;
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const DISPLAY_FONT = '"Saira Condensed", "IBM Plex Sans Arabic", system-ui, sans-serif';
const BODY_FONT = '"Inter Tight", "IBM Plex Sans Arabic", system-ui, sans-serif';

const COLOR = {
  background: '#0b1119',
  panel: '#0f1720',
  line: '#1d2a38',
  text: '#e8eff7',
  muted: '#93a3b5',
  accent: '#3dd6f5',
  hit: '#f5b73d',
} as const;

const PAD = 64;
const CONTENT = CARD_WIDTH - PAD * 2;

/** Horizontal layout anchor: where text starts, and how it aligns there. */
interface Frame {
  startX: number;
  align: CanvasTextAlign;
  /** +1 when text grows to the right, -1 when it grows to the left. */
  step: 1 | -1;
  direction: 'ltr' | 'rtl';
}

function frameFor(locale: 'en' | 'ar'): Frame {
  if (locale === 'ar') {
    return { startX: CARD_WIDTH - PAD, align: 'right', step: -1, direction: 'rtl' };
  }
  return { startX: PAD, align: 'left', step: 1, direction: 'ltr' };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

interface TextOptions {
  font: string;
  color: string;
  align: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  direction?: 'ltr' | 'rtl';
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options: TextOptions,
): void {
  ctx.save();
  ctx.font = options.font;
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align;
  ctx.textBaseline = options.baseline ?? 'alphabetic';
  ctx.direction = options.direction ?? (options.align === 'right' ? 'rtl' : 'ltr');
  ctx.fillText(value, x, y);
  ctx.restore();
}

function measure(ctx: CanvasRenderingContext2D, font: string, value: string): number {
  ctx.save();
  ctx.font = font;
  const width = ctx.measureText(value).width;
  ctx.restore();
  return width;
}

function fit(ctx: CanvasRenderingContext2D, font: string, size: number, value: string): string {
  if (measure(ctx, font, value) <= CONTENT) return font;
  const shrunk = Math.max(48, Math.floor((size * CONTENT) / measure(ctx, font, value)));
  return font.replace(/\d+px/, `${shrunk}px`);
}

function truncate(
  ctx: CanvasRenderingContext2D,
  font: string,
  value: string,
  maxWidth: number,
): string {
  if (measure(ctx, font, value) <= maxWidth) return value;
  let out = value;
  while (out.length > 8 && measure(ctx, font, `${out}…`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');

  const frame = frameFor(data.locale);
  const isRtl = data.locale === 'ar';

  ctx.fillStyle = COLOR.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // A quiet panel edge and an accent rule give the card a printed feel.
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD / 2, PAD / 2, CARD_WIDTH - PAD, CARD_HEIGHT - PAD);

  ctx.fillStyle = COLOR.accent;
  ctx.fillRect(PAD, PAD - 28, CONTENT, 4);

  text(ctx, 'FlickLab', frame.startX, PAD + 24, {
    font: `700 34px ${DISPLAY_FONT}`,
    color: COLOR.text,
    align: frame.align,
    direction: 'ltr',
  });

  text(ctx, data.modeLabel, frame.startX, PAD + 62, {
    font: `500 24px ${BODY_FONT}`,
    color: COLOR.muted,
    align: frame.align,
    direction: frame.direction,
  });

  let cursorY = PAD + 108;
  if (data.isBest) {
    const pillFont = `700 18px ${BODY_FONT}`;
    const pillText = isRtl ? 'أفضل نتيجة' : 'PERSONAL BEST';
    const pillHeight = 40;
    const pillWidth = measure(ctx, pillFont, pillText) + 44;
    const pillX = isRtl ? frame.startX - pillWidth : frame.startX;
    ctx.fillStyle = COLOR.hit;
    roundRect(ctx, pillX, cursorY, pillWidth, pillHeight, pillHeight / 2);
    ctx.fill();
    text(ctx, pillText, pillX + pillWidth / 2, cursorY + pillHeight / 2 + 1, {
      font: pillFont,
      color: COLOR.background,
      align: 'center',
      baseline: 'middle',
      direction: frame.direction,
    });
    cursorY += pillHeight + 22;
  }

  // The score is the only thing anyone reads on a share card, so it gets the
  // largest type that still fits the content width.
  const scoreValue = String(data.score);
  const scoreFont = fit(ctx, `700 176px ${DISPLAY_FONT}`, 176, scoreValue);
  text(ctx, scoreValue, frame.startX, cursorY + 132, {
    font: scoreFont,
    color: COLOR.text,
    align: frame.align,
    direction: 'ltr',
  });

  const captionY = cursorY + 176;
  text(ctx, isRtl ? 'نقطة' : 'score', frame.startX, captionY, {
    font: `500 24px ${BODY_FONT}`,
    color: COLOR.muted,
    align: frame.align,
    direction: frame.direction,
  });

  // Details row: three equal columns that grow in the reading direction.
  const detailLabelY = CARD_HEIGHT - PAD - 96;
  const detailValueY = detailLabelY + 30;
  const gap = 32;
  const colWidth = (CONTENT - gap * 2) / 3;
  const columns: Array<[string, string]> = [
    [isRtl ? 'دقة' : 'accuracy', data.accuracyPct === null ? '—' : `${data.accuracyPct}%`],
    [isRtl ? 'الصعوبة' : 'difficulty', data.difficultyLabel],
    [isRtl ? 'البذرة' : 'seed', String(data.seed)],
  ];

  columns.forEach(([label, value], index) => {
    const x = frame.startX + frame.step * index * (colWidth + gap);
    text(ctx, label, x, detailLabelY, {
      font: `400 18px ${BODY_FONT}`,
      color: COLOR.muted,
      align: frame.align,
      direction: frame.direction,
    });
    text(ctx, value, x, detailValueY, {
      font: `500 26px ${BODY_FONT}`,
      color: COLOR.text,
      align: frame.align,
      direction: /^\d+%?$/.test(value) ? 'ltr' : frame.direction,
    });
  });

  // Footer: the replay URL is Latin, so it is always laid out left to right.
  const urlFont = `400 18px ${BODY_FONT}`;
  const url = truncate(ctx, urlFont, data.url, CONTENT);
  text(ctx, url, isRtl ? CARD_WIDTH - PAD : PAD, CARD_HEIGHT - PAD + 8, {
    font: urlFont,
    color: COLOR.muted,
    align: isRtl ? 'right' : 'left',
    baseline: 'alphabetic',
    direction: 'ltr',
  });
}

export function shareCardBlob(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const fontsReady = 'fonts' in document ? document.fonts.ready : Promise.resolve();
  return fontsReady.then(
    () =>
      new Promise<Blob>((resolve, reject) => {
        drawShareCard(canvas, data);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas produced no PNG data'));
        }, 'image/png');
      }),
  );
}
