import type { TargetColorId, TargetShape, ThemeId } from '../engine/palette';

export type CrosshairShape = 'cross' | 'dot' | 'circle' | 't';

export interface CrosshairSettings {
  shape: CrosshairShape;
  /** Arm length in CSS px (radius for the circle shape). */
  size: number;
  thickness: number;
  gap: number;
  color: string;
  opacity: number;
  outline: boolean;
}

export interface Settings {
  theme: ThemeId;
  targetColor: TargetColorId;
  targetShape: TargetShape;
  targetScale: number;
  crosshair: CrosshairSettings;
  sensitivity: number;
  pointerLock: boolean;
  volume: number;
  muted: boolean;
  reducedMotion: boolean;
}

const KEY = 'flicklab.settings.v1';
const SHARE_PREFIX = 'FL1.';

export const DEFAULT_CROSSHAIR: CrosshairSettings = {
  shape: 'cross',
  size: 9,
  thickness: 2,
  gap: 4,
  color: '#e8f1fa',
  opacity: 1,
  outline: true,
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'ink',
  targetColor: 'frost',
  targetShape: 'disc',
  targetScale: 1,
  crosshair: DEFAULT_CROSSHAIR,
  sensitivity: 1,
  pointerLock: false,
  volume: 0.7,
  muted: false,
  reducedMotion: false,
};

const CROSSHAIR_SHAPES: readonly CrosshairShape[] = ['cross', 'dot', 'circle', 't'];
const TARGET_SHAPES: readonly TargetShape[] = ['disc', 'ring', 'square'];
const THEMES: readonly ThemeId[] = ['ink', 'graphite', 'dusk'];
const TARGET_COLORS: readonly TargetColorId[] = ['frost', 'sand', 'mint', 'violet'];
const HEX = /^#[0-9a-f]{6}$/i;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function defaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    crosshair: { ...DEFAULT_CROSSHAIR },
    reducedMotion: prefersReducedMotion(),
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    return sanitizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota: the session keeps the in-memory values.
  }
}

/** Coerces unknown JSON into a complete, in-range Settings object. */
export function sanitizeSettings(value: unknown): Settings {
  const base = defaultSettings();
  if (typeof value !== 'object' || value === null) return base;
  const raw = value as Record<string, unknown>;
  const crosshair = (raw['crosshair'] ?? {}) as Record<string, unknown>;

  return {
    theme: pick(raw['theme'], THEMES, base.theme),
    targetColor: pick(raw['targetColor'], TARGET_COLORS, base.targetColor),
    targetShape: pick(raw['targetShape'], TARGET_SHAPES, base.targetShape),
    targetScale: num(raw['targetScale'], 0.7, 1.4, base.targetScale),
    crosshair: {
      shape: pick(crosshair['shape'], CROSSHAIR_SHAPES, base.crosshair.shape),
      size: num(crosshair['size'], 2, 40, base.crosshair.size),
      thickness: num(crosshair['thickness'], 1, 10, base.crosshair.thickness),
      gap: num(crosshair['gap'], 0, 24, base.crosshair.gap),
      color: typeof crosshair['color'] === 'string' && HEX.test(crosshair['color'])
        ? crosshair['color'].toLowerCase()
        : base.crosshair.color,
      opacity: num(crosshair['opacity'], 0.15, 1, base.crosshair.opacity),
      outline: typeof crosshair['outline'] === 'boolean' ? crosshair['outline'] : base.crosshair.outline,
    },
    sensitivity: num(raw['sensitivity'], 0.2, 4, base.sensitivity),
    pointerLock: bool(raw['pointerLock'], base.pointerLock),
    volume: num(raw['volume'], 0, 1, base.volume),
    muted: bool(raw['muted'], base.muted),
    reducedMotion: bool(raw['reducedMotion'], base.reducedMotion),
  };
}

export function encodeShareCode(settings: Settings): string {
  const json = JSON.stringify(settings);
  const base64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${SHARE_PREFIX}${base64}`;
}

export function decodeShareCode(code: string): Settings | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SHARE_PREFIX)) return null;
  const body = trimmed.slice(SHARE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
  try {
    const base64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return sanitizeSettings(JSON.parse(atob(padded)) as unknown);
  } catch {
    return null;
  }
}

/**
 * Builds a CSS cursor from the crosshair settings. The SVG is drawn at the
 * settings' own scale so the desktop cursor matches what the editor previews,
 * and the hotspot is the exact centre of the image.
 */
interface CrosshairArt {
  /** `url("data:image/svg+xml,...")` for CSS cursor and background use. */
  url: string;
  /** Hotspot offset in image pixels (half the painted box). */
  hotspot: number;
}

/**
 * Paints the crosshair as an SVG data URL. `scale` only changes the painted
 * size; the geometry inside the viewBox is unchanged, so previews and the
 * desktop cursor are the same shape.
 */
function crosshairArt(crosshair: CrosshairSettings, scale: number): CrosshairArt {
  const t = clamp(crosshair.thickness, 1, 10);
  const gap = clamp(crosshair.gap, 0, 24);
  const size = clamp(crosshair.size, 2, 40);
  const reach = crosshair.shape === 'dot' ? t : gap + size;
  const pad = t + 2;
  const box = Math.ceil((reach + pad) * 2);
  const c = box / 2;
  const color = HEX.test(crosshair.color) ? crosshair.color : '#ffffff';
  const opacity = clamp(crosshair.opacity, 0.15, 1);

  const paths: string[] = [];
  switch (crosshair.shape) {
    case 'dot':
      paths.push(`<circle cx="${c}" cy="${c}" r="${Math.max(1.4, t)}" fill="${color}" stroke="none"/>`);
      break;
    case 'circle':
      paths.push(`<circle cx="${c}" cy="${c}" r="${size}" fill="none"/>`);
      break;
    case 't':
      paths.push(
        `<path d="M${c - gap - size} ${c}H${c - gap}M${c + gap} ${c}H${c + gap + size}M${c} ${c + gap}V${c + gap + size}"/>`,
      );
      break;
    default:
      paths.push(
        `<path d="M${c - gap - size} ${c}H${c - gap}M${c + gap} ${c}H${c + gap + size}M${c} ${c - gap - size}V${c - gap}M${c} ${c + gap}V${c + gap + size}"/>`,
      );
  }

  const body = paths.join('');
  const outline = crosshair.outline
    ? `<g fill="none" stroke="#05070a" stroke-width="${t + 2}" stroke-linecap="butt">${body}</g>`
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box * scale}" height="${box * scale}" ` +
    `viewBox="0 0 ${box} ${box}">` +
    outline +
    `<g fill="none" stroke="${color}" stroke-width="${t}" stroke-linecap="butt" opacity="${opacity}">${body}</g>` +
    '</svg>';

  return {
    url: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    hotspot: c * scale,
  };
}

/** The crosshair as a CSS `background-image` value, enlarged for previews. */
export function crosshairImage(crosshair: CrosshairSettings, scale = 2): string {
  return crosshairArt(crosshair, scale).url;
}

/** The crosshair as a ready-to-use CSS `cursor` value. */
export function crosshairCursor(crosshair: CrosshairSettings): string {
  const { url, hotspot } = crosshairArt(crosshair, 1);
  return `${url} ${hotspot} ${hotspot}, crosshair`;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
