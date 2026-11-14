export type ModeId = 'gridshot' | 'flick' | 'tracking' | 'precision' | 'reaction' | 'cps';
export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export const DURATIONS: readonly number[] = [15, 30, 60];

export interface RunConfig {
  mode: ModeId;
  difficulty: Difficulty;
  durationMs: number;
  seed: number;
}

export interface World {
  w: number;
  h: number;
}

export interface ModeResultCore {
  hits: number;
  misses: number;
  score: number;
  /** Sum and count of hit latencies in ms (average is derived). */
  latencySum: number;
  latencyCount: number;
  bestStreak: number;
}

export interface RunResult extends ModeResultCore {
  mode: ModeId;
  difficulty: Difficulty;
  durationMs: number;
  seed: number;
  /** hits / (hits + misses), 0 when nothing was tapped. */
  accuracy: number;
  avgTimeToTarget: number | null;
  hitsPerSec: number;
  finishedAt: number;
}

export interface AimPoint {
  x: number;
  y: number;
  r: number;
}

/** One tap as it was applied to the simulation, relative to run start. */
export interface TapRecord {
  t: number;
  x: number;
  y: number;
  hit: boolean;
}

export interface ModeRuntime {
  readonly id: ModeId;
  /** Called when the countdown ends and the run clock starts. */
  begin(): void;
  update(dtMs: number, elapsedMs: number, cursorX: number, cursorY: number): void;
  /** Returns true when the tap landed on a valid target. */
  tap(x: number, y: number, ts: number, elapsedMs: number): boolean;
  draw(ctx: CanvasRenderingContext2D, alpha: number): void;
  result(): ModeResultCore;
  /** Optional hook used by tests to aim at live targets. */
  aimPoints?(): AimPoint[];
}
