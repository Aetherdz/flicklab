/**
 * Playfield palette. Dark slate is functional here, not decorative: targets must
 * sit at maximum contrast against the field, and glow reads as signal.
 * The accent is reserved for measured values (score, timer, focus).
 */
export const PALETTE = {
  field: '#0a0f16',
  fieldEdge: '#0d131b',
  grid: '#22303f',
  gridStrong: '#32475c',
  target: '#e8f1fa',
  targetRing: '#3dd6f5',
  targetInner: '#0a0f16',
  hit: '#f5b73d',
  miss: '#f2557a',
  text: '#e7eef6',
} as const;

export const TARGET_RADIUS: Record<'easy' | 'normal' | 'hard', number> = {
  easy: 0.115,
  normal: 0.085,
  hard: 0.06,
};

export const DIFFICULTY_SCORE_MULTIPLIER: Record<'easy' | 'normal' | 'hard', number> = {
  easy: 1,
  normal: 1.5,
  hard: 2,
};
