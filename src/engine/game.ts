import { COUNTDOWN_MS, FIXED_STEP_MS } from './constants';
import type { SfxName } from './audio';
import type { ModeRuntime, RunConfig, RunResult, TapRecord, World } from './types';

export { FIXED_STEP_MS, COUNTDOWN_MS } from './constants';
export const MAX_PENDING_TAPS = 32;
export type GameState = 'countdown' | 'running' | 'paused' | 'finished';

export interface GameOptions {
  config: RunConfig;
  mode: ModeRuntime;
  world: World;
  onSfx?: (name: SfxName) => void;
}

/**
 * Deterministic run simulation.
 *
 * The simulation advances only in fixed steps, driven from outside. Time is
 * derived from the step counter, so frame pacing cannot change what happens;
 * taps carry timestamps relative to run start and are applied at the next step.
 * Replaying the same seed and tap log reproduces the same result exactly.
 */
export class Game {
  readonly config: RunConfig;
  readonly world: World;
  state: GameState = 'countdown';

  private readonly mode: ModeRuntime;
  private readonly onSfx: ((name: SfxName) => void) | undefined;
  private readonly countdownTotalSteps = Math.round(COUNTDOWN_MS / FIXED_STEP_MS);
  private countdownSteps: number;
  private steps = 0;
  private cursorX = 0;
  private cursorY = 0;

  private readonly pendingX = new Float64Array(MAX_PENDING_TAPS);
  private readonly pendingY = new Float64Array(MAX_PENDING_TAPS);
  private readonly pendingTs = new Float64Array(MAX_PENDING_TAPS);
  private pendingCount = 0;
  private readonly taps: TapRecord[] = [];

  constructor(opts: GameOptions) {
    this.config = opts.config;
    this.mode = opts.mode;
    this.world = opts.world;
    this.onSfx = opts.onSfx;
    this.countdownSteps = this.countdownTotalSteps;
    this.cursorX = opts.world.w / 2;
    this.cursorY = opts.world.h / 2;
  }

  get elapsedMs(): number {
    return this.steps * FIXED_STEP_MS;
  }

  get remainingMs(): number {
    return Math.max(0, this.config.durationMs - this.elapsedMs);
  }

  get countdownRemainingMs(): number {
    return this.countdownSteps * FIXED_STEP_MS;
  }

  get tapLog(): readonly TapRecord[] {
    return this.taps;
  }

  get runtime(): ModeRuntime {
    return this.mode;
  }

  setWorld(w: number, h: number): void {
    this.world.w = w;
    this.world.h = h;
  }

  setCursor(x: number, y: number): void {
    this.cursorX = x;
    this.cursorY = y;
  }

  /** Queues a tap; coordinates and timestamp are relative to run start. */
  tap(x: number, y: number, ts: number): void {
    if (this.state !== 'running' || this.pendingCount >= MAX_PENDING_TAPS) return;
    const i = this.pendingCount++;
    this.pendingX[i] = x;
    this.pendingY[i] = y;
    this.pendingTs[i] = ts;
  }

  pause(): void {
    if (this.state === 'running') this.state = 'paused';
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'running';
  }

  step(): void {
    if (this.state === 'countdown') {
      const before = this.countdownSteps;
      this.countdownSteps--;
      if (before % 240 === 0 && this.countdownSteps > 0) this.onSfx?.('count');
      if (this.countdownSteps <= 0) {
        this.state = 'running';
        this.mode.begin();
      }
      return;
    }
    if (this.state !== 'running') return;

    const elapsed = this.elapsedMs;
    for (let i = 0; i < this.pendingCount; i++) {
      const hit = this.mode.tap(this.pendingX[i] as number, this.pendingY[i] as number, this.pendingTs[i] as number, elapsed);
      this.taps.push({
        t: elapsed,
        x: this.pendingX[i] as number,
        y: this.pendingY[i] as number,
        hit,
      });
      this.onSfx?.(hit ? 'hit' : 'miss');
    }
    this.pendingCount = 0;

    this.mode.update(FIXED_STEP_MS, elapsed, this.cursorX, this.cursorY);
    this.steps++;

    if (this.elapsedMs >= this.config.durationMs) {
      this.state = 'finished';
      this.onSfx?.('finish');
    }
  }

  result(now = Date.now()): RunResult {
    const core = this.mode.result();
    const attempts = core.hits + core.misses;
    const seconds = this.config.durationMs / 1000;
    return {
      mode: this.config.mode,
      difficulty: this.config.difficulty,
      durationMs: this.config.durationMs,
      seed: this.config.seed,
      finishedAt: now,
      ...core,
      accuracy: attempts > 0 ? core.hits / attempts : 0,
      avgTimeToTarget: core.latencyCount > 0 ? core.latencySum / core.latencyCount : null,
      hitsPerSec: core.hits / seconds,
    };
  }
}
