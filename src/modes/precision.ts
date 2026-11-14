import type { Appearance } from '../engine/appearance';
import { Effects } from '../engine/effects';
import { HIT_COLOR } from '../engine/palette';
import type { Rng } from '../engine/rng';
import { drawField, drawTarget, hitTarget } from '../engine/targets';
import { DIFFICULTY_SCORE_MULTIPLIER, TARGET_RADIUS } from '../engine/theme';
import type {
  AimPoint,
  Difficulty,
  ModeResultCore,
  ModeRuntime,
  RunConfig,
  World,
} from '../engine/types';

const MARGIN = 0.1;
const SHRINK = 0.955;
const MIN_SCALE = 0.55;

/**
 * Precision: one small target at a time. Every hit nudges the target smaller,
 * and a miss restores its full size — the run rewards not clicking at all
 * unless the cursor is already inside. There is no speed component in the
 * score, so patience is never punished here.
 */
export class Precision implements ModeRuntime {
  readonly id = 'precision' as const;

  private readonly baseScale: number;
  private readonly multiplier: number;
  private readonly effects = new Effects(32, 6);

  private x = 0;
  private y = 0;
  private scale = 1;
  private spawnTs = 0;

  private hits = 0;
  private misses = 0;
  private streak = 0;
  private bestStreak = 0;
  private latencySum = 0;
  private latencyCount = 0;

  constructor(
    config: RunConfig,
    private readonly rng: Rng,
    private readonly world: World,
    private readonly look: Appearance,
  ) {
    const difficulty = config.difficulty as Difficulty;
    this.baseScale = TARGET_RADIUS[difficulty] * 0.42;
    this.multiplier = DIFFICULTY_SCORE_MULTIPLIER[difficulty];
  }

  begin(): void {
    this.hits = 0;
    this.misses = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.latencySum = 0;
    this.latencyCount = 0;
    this.scale = 1;
    this.effects.clear();
    this.x = this.world.w / 2;
    this.y = this.world.h / 2;
    this.pickPoint();
    this.spawnTs = 0;
  }

  update(dtMs: number): void {
    if (this.look.reducedMotion) {
      this.effects.clear();
      return;
    }
    this.effects.update(dtMs);
  }

  tap(x: number, y: number, ts: number): boolean {
    const r = this.radiusPx();
    if (!hitTarget(this.x, this.y, r, x, y)) {
      this.misses++;
      this.streak = 0;
      this.scale = 1;
      return false;
    }

    this.hits++;
    this.streak++;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    this.latencySum += Math.max(0, ts - this.spawnTs);
    this.latencyCount++;

    if (!this.look.reducedMotion) {
      this.effects.burst(this.x, this.y, 0.8);
      this.effects.ring(this.x, this.y, r);
    }
    this.scale = Math.max(MIN_SCALE, this.scale * SHRINK);
    this.pickPoint();
    this.spawnTs = ts;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.world;
    const theme = this.look.theme;
    drawField(ctx, w, h, theme.field, theme.grid, theme.gridStrong);
    drawTarget(ctx, this.x, this.y, this.radiusPx(), {
      ...this.look.target,
      shape: this.look.shape,
    });
    this.effects.draw(ctx, HIT_COLOR);
  }

  result(): ModeResultCore {
    return {
      hits: this.hits,
      misses: this.misses,
      score: Math.round(this.hits * this.multiplier * 10),
      latencySum: this.latencySum,
      latencyCount: this.latencyCount,
      bestStreak: this.bestStreak,
    };
  }

  aimPoints(): AimPoint[] {
    return [{ x: this.x, y: this.y, r: this.radiusPx() }];
  }

  private radiusPx(): number {
    return Math.min(this.world.w, this.world.h) * this.baseScale * this.scale * this.look.targetScale;
  }

  private pickPoint(): void {
    const { w, h } = this.world;
    const margin = Math.min(w, h) * MARGIN;
    const minJump = Math.min(w, h) * 0.16;
    for (let attempt = 0; attempt < 16; attempt++) {
      const px = margin + this.rng.next() * (w - margin * 2);
      const py = margin + this.rng.next() * (h - margin * 2);
      const dx = px - this.x;
      const dy = py - this.y;
      if (dx * dx + dy * dy >= minJump * minJump) {
        this.x = px;
        this.y = py;
        return;
      }
    }
    // Fall back to the last sampled point rather than looping forever.
    this.x = margin + this.rng.next() * (w - margin * 2);
    this.y = margin + this.rng.next() * (h - margin * 2);
  }
}
