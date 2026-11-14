import type { Appearance } from '../engine/appearance';
import { Effects } from '../engine/effects';
import { HIT_COLOR, MISS_COLOR } from '../engine/palette';
import type { Rng } from '../engine/rng';
import { drawField, drawTarget } from '../engine/targets';
import { DIFFICULTY_SCORE_MULTIPLIER } from '../engine/theme';
import type {
  AimPoint,
  Difficulty,
  HudProgress,
  ModeResultCore,
  ModeRuntime,
  RunConfig,
  World,
} from '../engine/types';

type Phase = 'wait' | 'signal' | 'done';

const TRIALS = 5;

interface Tuning {
  radius: number;
  minDelay: number;
  maxDelay: number;
}

const TUNING: Record<Difficulty, Tuning> = {
  easy: { radius: 0.2, minDelay: 900, maxDelay: 1900 },
  normal: { radius: 0.155, minDelay: 800, maxDelay: 2600 },
  hard: { radius: 0.115, minDelay: 700, maxDelay: 3400 },
};

/**
 * Reaction time: five trials. Between trials the field is empty; a disc appears
 * after a seeded random delay and the clock runs from the step the disc became
 * visible to the timestamp of the click that hit it. Clicking early is a false
 * start and ends the trial.
 */
export class Reaction implements ModeRuntime {
  readonly id = 'reaction' as const;

  private readonly tuning: Tuning;
  private readonly multiplier: number;
  private readonly effects = new Effects(24, 6);

  private phase: Phase = 'wait';
  private trial = 0;
  private earlyStarts = 0;
  private signalAt = 0;
  private signalTs = 0;
  private hits = 0;
  private misses = 0;
  private latencySum = 0;
  private latencyCount = 0;

  constructor(
    config: RunConfig,
    private readonly rng: Rng,
    private readonly world: World,
    private readonly look: Appearance,
  ) {
    this.tuning = TUNING[config.difficulty as Difficulty];
    this.multiplier = DIFFICULTY_SCORE_MULTIPLIER[config.difficulty as Difficulty];
  }

  begin(): void {
    this.trial = 0;
    this.earlyStarts = 0;
    this.hits = 0;
    this.misses = 0;
    this.latencySum = 0;
    this.latencyCount = 0;
    this.effects.clear();
    this.scheduleWait(0);
  }

  update(dtMs: number, elapsedMs: number): void {
    if (!this.look.reducedMotion) this.effects.update(dtMs);
    if (this.phase === 'wait' && elapsedMs >= this.signalAt) {
      this.phase = 'signal';
      this.signalTs = elapsedMs;
    }
  }

  tap(x: number, y: number, ts: number, elapsedMs: number): boolean {
    if (this.phase === 'wait') {
      this.misses++;
      this.earlyStarts++;
      this.trial++;
      if (!this.look.reducedMotion) this.effects.ring(x, y, 14);
      this.advance(elapsedMs);
      return false;
    }
    if (this.phase !== 'signal') return false;

    const hit = this.hitTest(x, y);
    if (!hit) {
      this.misses++;
      this.trial++;
      this.advance(elapsedMs);
      return false;
    }

    this.hits++;
    this.latencySum += Math.max(0, ts - this.signalTs);
    this.latencyCount++;
    this.trial++;
    if (!this.look.reducedMotion) {
      this.effects.burst(x, y, 1);
      this.effects.ring(x, y, this.radiusPx());
    }
    this.advance(elapsedMs);
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.world;
    const theme = this.look.theme;
    drawField(ctx, w, h, theme.field, theme.grid, theme.gridStrong);

    const cx = w / 2;
    const cy = h / 2;
    const r = this.radiusPx();

    if (this.phase === 'signal') {
      drawTarget(ctx, cx, cy, r, { ...this.look.target, shape: this.look.shape });
    } else if (this.phase === 'wait') {
      ctx.strokeStyle = theme.gridStrong;
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Trial pips: one square per attempt, filled for finished trials.
    const pipW = Math.min(26, w * 0.02);
    const gap = pipW * 0.6;
    const total = TRIALS * pipW + (TRIALS - 1) * gap;
    let px = (w - total) / 2;
    const py = Math.min(28, h * 0.05);
    for (let i = 0; i < TRIALS; i++) {
      ctx.fillStyle = i < this.trial ? theme.gridStrong : theme.grid;
      ctx.fillRect(px, py, pipW, Math.max(2, pipW * 0.14));
      px += pipW + gap;
    }

    this.effects.draw(ctx, this.phase === 'signal' ? HIT_COLOR : MISS_COLOR);
  }

  result(): ModeResultCore {
    const avg = this.latencyCount > 0 ? this.latencySum / this.latencyCount : 0;
    return {
      hits: this.hits,
      misses: this.misses,
      score: avg > 0 ? Math.round((100_000 / avg) * this.multiplier) : 0,
      latencySum: this.latencySum,
      latencyCount: this.latencyCount,
      bestStreak: this.hits,
    };
  }

  complete(): boolean {
    return this.trial >= TRIALS;
  }

  progress(): HudProgress {
    return {
      label: 'Trial',
      value: `${Math.min(this.trial + 1, TRIALS)}/${TRIALS}`,
    };
  }

  aimPoints(): AimPoint[] {
    if (this.phase !== 'signal') return [];
    return [{ x: this.world.w / 2, y: this.world.h / 2, r: this.radiusPx() }];
  }

  private advance(elapsedMs: number): void {
    if (this.trial >= TRIALS) {
      this.phase = 'done';
      return;
    }
    this.scheduleWait(elapsedMs);
  }

  private scheduleWait(elapsedMs: number): void {
    this.phase = 'wait';
    // Seeded delay inside the difficulty window; the signal always arrives
    // after at least the minimum delay, so anticipation cannot be timed.
    this.signalAt =
      elapsedMs + this.tuning.minDelay + this.rng.next() * (this.tuning.maxDelay - this.tuning.minDelay);
  }

  private hitTest(x: number, y: number): boolean {
    const dx = this.world.w / 2 - x;
    const dy = this.world.h / 2 - y;
    const r = this.radiusPx();
    return dx * dx + dy * dy <= r * r;
  }

  private radiusPx(): number {
    return Math.min(this.world.w, this.world.h) * this.tuning.radius * this.look.targetScale;
  }
}
