import { Sfx } from '../engine/audio';
import { Surface } from '../engine/canvas';
import { FIXED_STEP_MS } from '../engine/constants';
import { Game, type GameState } from '../engine/game';
import { PointerInput } from '../engine/input';
import { Loop } from '../engine/loop';
import { Rng } from '../engine/rng';
import type { AimPoint, Difficulty, ModeId, RunConfig, RunResult } from '../engine/types';
import { createMode } from '../modes/registry';
import { saveRun } from '../stats/store';

export type UiPhase = 'idle' | 'countdown' | 'playing' | 'paused' | 'finished';

export interface HudSnapshot {
  score: number;
  timeLeftMs: number;
  accuracy: number;
  hits: number;
  attempts: number;
  countdown: number;
}

export interface ResultPayload {
  result: RunResult;
  isBest: boolean;
  previousBest: number | null;
}

export interface ControllerCallbacks {
  onPhase(phase: UiPhase): void;
  onHud(hud: HudSnapshot): void;
  onResult(payload: ResultPayload): void;
}

export interface ControllerOptions {
  mode: ModeId;
  difficulty: Difficulty;
  durationMs: number;
  callbacks: ControllerCallbacks;
  /** Manual mode is used by tests: the loop never runs, advance() drives it. */
  manual?: boolean;
  sensitivity?: number;
}

const EMPTY_HUD: HudSnapshot = { score: 0, timeLeftMs: 0, accuracy: 0, hits: 0, attempts: 0, countdown: 0 };

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] as number) >>> 0;
}

/**
 * Binds the pure simulation to the browser: canvas surface, loop, input, audio,
 * persistence. The Preact shell only reads the snapshots this class publishes.
 */
export class GameController {
  readonly surface: Surface;
  readonly mode: ModeId;

  private readonly input: PointerInput;
  private readonly loop = new Loop();
  private readonly sfx = new Sfx();
  private readonly callbacks: ControllerCallbacks;
  private readonly manual: boolean;

  private game: Game | null = null;
  private idleGame: Game | null = null;
  private phase: UiPhase = 'idle';
  private origin = 0;
  private lastHudAt = 0;
  private destroyed = false;

  /** Latest published snapshots, read by the test bridge. */
  lastHud: HudSnapshot = EMPTY_HUD;
  lastResult: RunResult | null = null;

  difficulty: Difficulty;
  durationMs: number;

  constructor(canvas: HTMLCanvasElement, opts: ControllerOptions) {
    this.mode = opts.mode;
    this.difficulty = opts.difficulty;
    this.durationMs = opts.durationMs;
    this.callbacks = opts.callbacks;
    this.manual = opts.manual ?? false;

    this.surface = new Surface(canvas);
    this.input = new PointerInput(
      canvas,
      {
        onTap: (x, y, ts) => this.handleTap(x, y, ts),
        onMove: (x, y) => this.game?.setCursor(x, y),
      },
      { sensitivity: opts.sensitivity ?? 1 },
    );

    this.surface.onResize(() => {
      const { cssW, cssH } = this.surface.view;
      this.game?.setWorld(cssW, cssH);
      this.idleGame?.setWorld(cssW, cssH);
      if (!this.game && !this.idleGame) this.preview();
      this.draw();
    });

    this.loop.onStep(() => this.stepOnce());
    this.loop.onRender(() => {
      this.draw();
      this.publishHud();
    });

    this.preview();
  }

  get currentGame(): Game | null {
    return this.game;
  }

  get currentPhase(): UiPhase {
    return this.phase;
  }

  setDifficulty(difficulty: Difficulty): void {
    if (this.phase === 'countdown' || this.phase === 'playing' || this.phase === 'paused') return;
    this.difficulty = difficulty;
    this.game = null;
    this.preview();
  }

  setDuration(durationMs: number): void {
    if (this.phase === 'countdown' || this.phase === 'playing' || this.phase === 'paused') return;
    this.durationMs = durationMs;
    this.game = null;
    this.preview();
  }

  setSensitivity(value: number): void {
    this.input.setSensitivity(value);
  }

  start(seed?: number): void {
    if (this.destroyed) return;
    const config: RunConfig = {
      mode: this.mode,
      difficulty: this.difficulty,
      durationMs: this.durationMs,
      seed: (seed ?? randomSeed()) >>> 0,
    };
    const world = { w: this.surface.view.cssW, h: this.surface.view.cssH };
    const rng = new Rng(config.seed);
    const game = new Game({
      config,
      mode: createMode(config, rng, world),
      world,
      onSfx: (name) => this.sfx.play(name),
    });
    this.game = game;
    this.idleGame = null;
    this.sfx.unlock();
    this.setPhase('countdown');
    this.publishHud(true);
    this.loop.resetClock();
    if (!this.manual) this.loop.start();
    this.draw();
  }

  restart(): void {
    this.start();
  }

  /** Returns to the idle preview, keeping the chosen difficulty and duration. */
  reset(): void {
    this.loop.stop();
    this.game = null;
    this.lastResult = null;
    this.setPhase('idle');
    this.idleGame = null;
    this.preview();
    this.publishHud(true);
  }

  togglePause(): void {
    const game = this.game;
    if (!game) return;
    if (game.state === 'running') {
      game.pause();
      this.loop.stop();
      this.setPhase('paused');
      this.draw();
    } else if (game.state === 'paused') {
      game.resume();
      this.loop.resetClock();
      this.loop.start();
      this.setPhase('playing');
    }
  }

  /** Drives the simulation directly. Used by tests; safe to call any time. */
  advance(ms: number): void {
    if (!this.game) return;
    const steps = Math.max(0, Math.round(ms / FIXED_STEP_MS));
    for (let i = 0; i < steps; i++) this.stepOnce();
    this.draw();
    this.publishHud(true);
  }

  tapAt(x: number, y: number, tsRel?: number): void {
    const game = this.game;
    if (!game || game.state !== 'running') return;
    const rel = tsRel ?? game.elapsedMs;
    game.tap(x, y, rel);
  }

  targets(): AimPoint[] {
    if (this.game) return this.game.runtime.aimPoints?.() ?? [];
    return this.idleGame?.runtime.aimPoints?.() ?? [];
  }

  canvasSize(): { w: number; h: number } {
    return { w: this.surface.view.cssW, h: this.surface.view.cssH };
  }

  draw(): void {
    if (this.destroyed) return;
    const ctx = this.surface.ctx;
    const game = this.game ?? this.idleGame;
    if (!game) return;
    game.runtime.draw(ctx, 1);
  }

  destroy(): void {
    this.destroyed = true;
    this.loop.stop();
    this.input.dispose();
    this.surface.dispose();
    this.sfx.dispose();
  }

  private preview(): void {
    const { cssW, cssH } = this.surface.view;
    if (cssW < 2 || cssH < 2) return;
    const config: RunConfig = {
      mode: this.mode,
      difficulty: this.difficulty,
      durationMs: this.durationMs,
      seed: 0x5eed,
    };
    const world = { w: cssW, h: cssH };
    const game = new Game({
      config,
      mode: createMode(config, new Rng(config.seed), world),
      world,
    });
    game.runtime.begin();
    this.idleGame = game;
    this.draw();
  }

  private stepOnce(): void {
    const game = this.game;
    if (!game) return;
    const before: GameState = game.state;
    game.step();
    if (before === 'countdown' && game.state === 'running') {
      this.origin = performance.now();
      this.setPhase('playing');
    }
    if (game.state === 'finished' && this.phase !== 'finished') this.finish();
  }

  private finish(): void {
    const game = this.game;
    if (!game) return;
    this.loop.stop();
    const result = game.result();
    this.lastResult = result;
    const info = saveRun(result);
    this.setPhase('finished');
    this.callbacks.onResult({ result, isBest: info.isBest, previousBest: info.previousBest });
    this.publishHud(true);
    this.draw();
  }

  private handleTap(x: number, y: number, ts: number): void {
    const game = this.game;
    if (!game || game.state !== 'running') return;
    // Every tap is a user gesture: use it to create or resume the audio context.
    this.sfx.unlock();
    game.tap(x, y, ts - this.origin);
  }

  private setPhase(phase: UiPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.callbacks.onPhase(phase);
  }

  private publishHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudAt < 100) return;
    this.lastHudAt = now;
    const game = this.game;
    if (!game) {
      this.lastHud = EMPTY_HUD;
      this.callbacks.onHud(EMPTY_HUD);
      return;
    }
    const core = game.runtime.result();
    const attempts = core.hits + core.misses;
    const hud: HudSnapshot = {
      score: core.score,
      timeLeftMs: Math.max(0, game.remainingMs),
      accuracy: attempts > 0 ? core.hits / attempts : 0,
      hits: core.hits,
      attempts,
      countdown: game.state === 'countdown' ? Math.ceil(game.countdownRemainingMs / 1000) : 0,
    };
    this.lastHud = hud;
    this.callbacks.onHud(hud);
  }
}
