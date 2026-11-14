import type { Appearance } from '../engine/appearance';
import { Effects } from '../engine/effects';
import { HIT_COLOR } from '../engine/palette';
import { drawField } from '../engine/targets';
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

const PAD_SIZE = 0.5;
const MIN_GAP_MS = 20;

/**
 * Click speed. Clicks inside the pad count; clicks outside are misses. A
 * 20 ms floor ignores hardware double-click bounce without capping a real
 * click rate (that would be 50 clicks per second).
 */
export class Cps implements ModeRuntime {
  readonly id = 'cps' as const;

  private readonly multiplier: number;
  private readonly effects = new Effects(32, 10);
  private elapsed = 0;
  private hits = 0;
  private misses = 0;
  private lastTapTs = -Infinity;

  constructor(
    config: RunConfig,
    private readonly world: World,
    private readonly look: Appearance,
  ) {
    this.multiplier = DIFFICULTY_SCORE_MULTIPLIER[config.difficulty as Difficulty];
  }

  begin(): void {
    this.elapsed = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastTapTs = -Infinity;
    this.effects.clear();
  }

  update(dtMs: number, elapsedMs: number): void {
    this.elapsed = elapsedMs;
    if (this.look.reducedMotion) {
      this.effects.clear();
      return;
    }
    this.effects.update(dtMs);
  }

  tap(x: number, y: number, ts: number): boolean {
    if (ts - this.lastTapTs < MIN_GAP_MS) return false;
    this.lastTapTs = ts;

    if (!this.inside(x, y)) {
      this.misses++;
      if (!this.look.reducedMotion) this.effects.ring(x, y, 10);
      return false;
    }

    this.hits++;
    if (!this.look.reducedMotion) this.effects.ring(x, y, this.sidePx() * 0.12);
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.world;
    const theme = this.look.theme;
    drawField(ctx, w, h, theme.field, theme.grid, theme.gridStrong);

    const side = this.sidePx();
    const x0 = w / 2 - side / 2;
    const y0 = h / 2 - side / 2;

    ctx.fillStyle = theme.fieldEdge;
    ctx.fillRect(x0, y0, side, side);
    ctx.strokeStyle = theme.gridStrong;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, side, side);

    // Corner brackets keep the pad legible without filling the field.
    ctx.strokeStyle = theme.ring;
    ctx.lineWidth = 3;
    const bracket = side * 0.12;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [
      [x0, y0, 1, 1],
      [x0 + side, y0, -1, 1],
      [x0, y0 + side, 1, -1],
      [x0 + side, y0 + side, -1, -1],
    ] as const) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + bracket * sx, cy);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + bracket * sy);
    }
    ctx.stroke();

    ctx.fillStyle = theme.grid;
    ctx.fillRect(w / 2 - side * 0.18, h / 2, side * 0.36, 1);
    ctx.fillRect(w / 2, h / 2 - side * 0.18, 1, side * 0.36);

    ctx.strokeStyle = theme.ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.max(3, side * 0.03), 0, Math.PI * 2);
    ctx.stroke();

    this.effects.draw(ctx, HIT_COLOR);
  }

  result(): ModeResultCore {
    const seconds = Math.max(0.001, this.elapsed / 1000);
    return {
      hits: this.hits,
      misses: this.misses,
      score: Math.round((this.hits / seconds) * 100 * this.multiplier),
      latencySum: 0,
      latencyCount: 0,
      bestStreak: this.hits,
    };
  }

  progress(): HudProgress {
    const seconds = Math.max(0.001, this.elapsed / 1000);
    return { label: 'hud.cps', value: (this.hits / seconds).toFixed(1) };
  }

  aimPoints(): AimPoint[] {
    return [{ x: this.world.w / 2, y: this.world.h / 2, r: this.sidePx() / 2 }];
  }

  private sidePx(): number {
    return Math.min(this.world.w, this.world.h) * PAD_SIZE;
  }

  private inside(x: number, y: number): boolean {
    const half = this.sidePx() / 2;
    return Math.abs(x - this.world.w / 2) <= half && Math.abs(y - this.world.h / 2) <= half;
  }
}
