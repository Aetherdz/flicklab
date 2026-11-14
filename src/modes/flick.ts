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

const MARGIN = 0.09;
const MIN_JUMP = 0.24;

/**
 * Flick: one target, and every hit moves it somewhere it was not. The run
 * measures the time between a target appearing and the click that removes it,
 * which is the only number that improves when a flick gets cleaner.
 */
export class Flick implements ModeRuntime {
  readonly id = 'flick' as const;

  private readonly radiusScale: number;
  private readonly multiplier: number;
  private readonly effects = new Effects(40, 6);

  private x = 0;
  private y = 0;
  private prevX = -1;
  private prevY = -1;
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
    this.radiusScale = TARGET_RADIUS[difficulty] * 0.92;
    this.multiplier = DIFFICULTY_SCORE_MULTIPLIER[difficulty];
  }

  begin(): void {
    this.hits = 0;
    this.misses = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.latencySum = 0;
    this.latencyCount = 0;
    this.prevX = -1;
    this.prevY = -1;
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
      return false;
    }

    this.hits++;
    this.streak++;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    this.latencySum += Math.max(0, ts - this.spawnTs);
    this.latencyCount++;

    if (!this.look.reducedMotion) {
      this.effects.burst(this.x, this.y);
      this.effects.ring(this.x, this.y, r);
    }
    this.prevX = this.x;
    this.prevY = this.y;
    this.pickPoint();
    this.spawnTs = ts;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.world;
    const theme = this.look.theme;
    drawField(ctx, w, h, theme.field, theme.grid, theme.gridStrong);

    if (this.prevX >= 0) {
      ctx.strokeStyle = theme.gridStrong;
      ctx.lineWidth = 1;
      const size = Math.max(4, this.radiusPx() * 0.5);
      ctx.beginPath();
      ctx.moveTo(this.prevX - size, this.prevY);
      ctx.lineTo(this.prevX + size, this.prevY);
      ctx.moveTo(this.prevX, this.prevY - size);
      ctx.lineTo(this.prevX, this.prevY + size);
      ctx.stroke();
    }

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
    return Math.min(this.world.w, this.world.h) * this.radiusScale * this.look.targetScale;
  }

  /** Rejection sampling with a minimum jump, so a flick always has distance. */
  private pickPoint(): void {
    const { w, h } = this.world;
    const margin = Math.min(w, h) * MARGIN;
    const minJump = Math.min(w, h) * MIN_JUMP;
    let bestX = w / 2;
    let bestY = h / 2;
    let bestDistance = -1;

    for (let attempt = 0; attempt < 24; attempt++) {
      const px = margin + this.rng.next() * (w - margin * 2);
      const py = margin + this.rng.next() * (h - margin * 2);
      const dx = px - this.prevX;
      const dy = py - this.prevY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (this.prevX < 0 || distance > minJump) {
        this.x = px;
        this.y = py;
        return;
      }
      if (distance > bestDistance) {
        bestDistance = distance;
        bestX = px;
        bestY = py;
      }
    }

    this.x = bestX;
    this.y = bestY;
  }
}
