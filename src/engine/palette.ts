export type ThemeId = 'ink' | 'graphite' | 'dusk';
export type TargetColorId = 'frost' | 'sand' | 'mint' | 'violet';
export type TargetShape = 'disc' | 'ring' | 'square';

export interface Theme {
  field: string;
  fieldEdge: string;
  grid: string;
  gridStrong: string;
  text: string;
  ring: string;
}

export interface TargetPalette {
  target: string;
  ring: string;
  inner: string;
}

/**
 * Field themes. Dark by design: targets must carry the contrast. The three
 * options differ in value and hue temperature, not in readability.
 */
export const THEMES: Record<ThemeId, Theme> = {
  ink: {
    field: '#0a0f16',
    fieldEdge: '#0d131b',
    grid: '#22303f',
    gridStrong: '#32475c',
    text: '#e7eef6',
    ring: '#3dd6f5',
  },
  graphite: {
    field: '#101012',
    fieldEdge: '#141417',
    grid: '#26262a',
    gridStrong: '#3a3a40',
    text: '#ececee',
    ring: '#9aa4b2',
  },
  dusk: {
    field: '#0d1220',
    fieldEdge: '#111728',
    grid: '#232d44',
    gridStrong: '#33405c',
    text: '#e6ecf8',
    ring: '#7c8cff',
  },
};

/**
 * Target palettes chosen to stay distinguishable for the common forms of
 * colour vision deficiency: every preset differs in lightness as well as hue,
 * and none relies on a red/green pair.
 */
export const TARGET_PALETTES: Record<TargetColorId, TargetPalette> = {
  frost: { target: '#e8f1fa', ring: '#3dd6f5', inner: '#0a0f16' },
  sand: { target: '#f6d089', ring: '#f2a33d', inner: '#1a1305' },
  mint: { target: '#b7f2d8', ring: '#4ad9a0', inner: '#04160f' },
  violet: { target: '#d3c7ff', ring: '#8e77ff', inner: '#0d0820' },
};

export const HIT_COLOR = '#f5b73d';
export const MISS_COLOR = '#f2557a';
