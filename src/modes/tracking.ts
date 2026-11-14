import type { Appearance } from '../engine/appearance';
import type { Rng } from '../engine/rng';
import { drawField, drawTarget } from '../engine/targets';
import { DIFFICULTY_SCORE_MULTIPLIER, TARGET_RADIUS } from '../engine/theme';
import type {
  AimPoint,
  Difficulty,
  ModeResultCore,
  ModeRuntime,
  RunConfig,
  World,
} from '../engine/types';

const SPEED: Record<Difficulty, number> = { easy: 0.78, normal: 1, hard: 1.32 };
const TRAIL_SIZE = 16;
const TRAIL_EVERY = 10;

/**
 * Tracking: the target never stops, and the score is the share of sampled time
 * the cursor spent inside it. Sampling happens on the simulation clock, not on
 * frames, so a slow machine does not change the ratio.
 *
 * The path is analytic (two sine components with seeded frequency and phase),
 * which keeps the motion identical across replays and across window sizes.
 */
export class Tracking implements ModeRuntime {
  readonly id = 'tracking' as const;

  private readonly radiusScale: number;
  private readonly multiplier: number;
  private readonly speed: number;

  private fx = 0.4;
  private fy = 0.33;
  private phaseX = 0;
  private phaseY = 0;

  private nx = 0.5;
  private ny = 0.5;
  private onSteps = 0;
  private offSteps = 0;
  private totalSteps = 0;
  private longestOnRun = 0;
  private currentOnRun = 0;

  private readonly trail = new Float64Array(TRAIL_SIZE * 2);
  private trailCount = 0;
  private trailCursor = 0;
  private stepIndex = 0;

  constructor(
    config: RunConfig,
    private readonly rng: Rng,
    private readonly world: World,
    private readonly look: Appearance,
  ) {
    const difficulty = config.difficulty as Difficulty;
    this.radiusScale = TARGET_RADIUS[difficulty] * 0.85;
    this.multiplier = DIFFICULTY_SCORE_MULTIPLIER[difficulty];
    this.speed = SPEED[difficulty];
  }

  begin(): void {
    this.fx = (0.3 + this.rng.next() * 0.26) * this.speed;
    this.fy = (0.24 + this.rng.next() * 0.3) * this.speed;
    this.phaseX = this.rng.next() * Math.PI * 2;
    this.phaseY = this.rng.next() * Math.PI * 2;
    this.onSteps = 0;
    this.offSteps = 0;
    this.totalSteps = 0;
    this.longestOnRun = 0;
    this.currentOnRun = 0;
    this.trailCount = 0;
    this.trailCursor = 0;
    this.stepIndex = 0;
    this.place(0);
    this.pushTrail();
  }

  update(_dtMs: number, elapsedMs: number, cursorX: number, cursorY: number): void {
    this.place(elapsedMs / 1000);

    const w = this.world.w;
    const h = this.world.h;
    const dx = this.nx * w - cursorX;
    const dy = this.ny * h - cursorY;
    const r = this.radiusPx();
    const onTarget = dx * dx + dy * dy <= r * r;

    this.totalSteps++;
    if (onTarget) {
      this.onSteps++;
      this.currentOnRun++;
      if (this.currentOnRun > this.longestOnRun) this.longestOnRun = this.currentOnRun;
    } else {
      this.offSteps++;
      this.currentOnRun = 0;
    }

    this.stepIndex++;
    if (this.stepIndex >= TRAIL_EVERY) {
      this.stepIndex = 0;
      this.pushTrail();
    }
  }

  tap(): boolean {
    // Clicking has no effect in tracking mode; only cursor position is scored.
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.world;
    const theme = this.look.theme;
    drawField(ctx, w, h, theme.field, theme.grid, theme.gridStrong);

    const r = this.radiusPx();
    ctx.fillStyle = theme.gridStrong;
    for (let i = 0; i < this.trailCount; i++) {
      const index = (this.trailCursor - 1 - i + TRAIL_SIZE * 2) % TRAIL_SIZE;
      const tx = (this.trail[index * 2] as number) * w;
      const ty = (this.trail[index * 2 + 1] as number) * h;
      ctx.globalAlpha = 0.35 * (1 - i / TRAIL_SIZE);
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(1.5, r * 0.13), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawTarget(ctx, this.nx * w, this.ny * h, r, {
      ...this.look.target,
      shape: this.look.shape,
    });
  }

  result(): ModeResultCore {
    const ratio = this.totalSteps > 0 ? this.onSteps / this.totalSteps : 0;
    return {
      hits: this.onSteps,
      misses: this.offSteps,
      score: Math.round(ratio * 100 * this.multiplier * 10),
      latencySum: 0,
      latencyCount: 0,
      bestStreak: this.longestOnRun,
      onTargetRatio: ratio,
    };
  }

  aimPoints(): AimPoint[] {
    return [{ x: this.nx * this.world.w, y: this.ny * this.world.h, r: this.radiusPx() }];
  }

  private place(t: number): void {
    this.nx = 0.5 + 0.4 * Math.sin(Math.PI * 2 * this.fx * t + this.phaseX);
    this.ny = 0.5 + 0.38 * Math.sin(Math.PI * 2 * this.fy * t + this.phaseY);
  }

  private radiusPx(): number {
    return Math.min(this.world.w, this.world.h) * this.radiusScale * this.look.targetScale;
  }

  private pushTrail(): void {
    this.trail[this.trailCursor * 2] = this.nx;
    this.trail[this.trailCursor * 2 + 1] = this.ny;
    this.trailCursor = (this.trailCursor + 1) % TRAIL_SIZE;
    if (this.trailCount < TRAIL_SIZE) this.trailCount++;
  }
}
