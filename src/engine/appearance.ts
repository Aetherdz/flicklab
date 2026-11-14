import {
  TARGET_PALETTES,
  THEMES,
  type TargetColorId,
  type TargetPalette,
  type TargetShape,
  type Theme,
  type ThemeId,
} from './palette';

export interface Appearance {
  theme: Theme;
  target: TargetPalette;
  shape: TargetShape;
  /** Global multiplier applied to every mode's target radius. */
  targetScale: number;
  reducedMotion: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: THEMES.ink,
  target: TARGET_PALETTES.frost,
  shape: 'disc',
  targetScale: 1,
  reducedMotion: false,
};

export function resolveAppearance(
  theme: ThemeId,
  color: TargetColorId,
  shape: TargetShape,
  targetScale: number,
  reducedMotion: boolean,
): Appearance {
  return {
    theme: THEMES[theme] ?? THEMES.ink,
    target: TARGET_PALETTES[color] ?? TARGET_PALETTES.frost,
    shape,
    targetScale: Math.min(1.4, Math.max(0.7, targetScale)),
    reducedMotion,
  };
}
