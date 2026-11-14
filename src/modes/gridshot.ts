import { Pool } from '../engine/pool';
import type { Rng } from '../engine/rng';
import { DIFFICULTY_SCORE_MULTIPLIER, PALETTE, TARGET_RADIUS } from '../engine/theme';
import type {
  AimPoint,
  Difficulty,
  ModeResultCore,
  ModeRuntime,
  RunConfig,
  World,
} from '../engine/types';

const GRID = 3;
const CELLS = GRID * GRID;
const ACTIVE = 3;
const SPARK_COUNT = 56;
const MARKER_COUNT = 12;
const GRID_FRACTION = 0.86;

/** One slot per grid cell; `active` marks the cell as currently holding a target. */
interface Slot {
  active: boolean;
  spawnTs: number;
}

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
}

interface Marker {
  active: boolean;
  x: number;
  y: number;
  life: number;
  ttl: number;
  radius: number;
}

const CELL_NX = new Float64Array(CELLS);
const CELL_NY = new Float64Array(CELLS);
for (let i = 0; i < CELLS; i++) {
  CELL_NX[i] = ((i % GRID) + 0.5) / GRID;
  CELL_NY[i] = (Math.floor(i / GRID) + 0.5) / GRID;
}

export class Gridshot implements ModeRuntime {
  readonly id = 'gridshot' as const;

  private readonly radiusScale: number;
  private readonly multiplier: number;
  private readonly slots: Slot[] = [];
  private readonly sparks: Pool<Spark>;
  private readonly markers: Pool<Marker>;
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
  ) {
    this.radiusScale = TARGET_RADIUS[config.difficulty as Difficulty];
    this.multiplier = DIFFICULTY_SCORE_MULTIPLIER[config.difficulty as Difficulty];
    for (let i = 0; i < CELLS; i++) {
      this.slots.push({ active: false, spawnTs: 0 });
    }
    this.sparks = new Pool<Spark>(SPARK_COUNT, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      ttl: 0,
    }));
    this.markers = new Pool<Marker>(MARKER_COUNT, () => ({
      active: false,
      x: 0,
      y: 0,
      life: 0,
      ttl: 0,
      radius: 0,
    }));
  }

  begin(): void {
    this.hits = 0;
    this.misses = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.latencySum = 0;
    this.latencyCount = 0;
    for (const slot of this.slots) slot.active = false;
    this.sparks.clear();
    this.markers.clear();
    for (let i = 0; i < ACTIVE; i++) this.spawn(0);
  }

  update(dtMs: number, _elapsedMs: number, _cursorX: number, _cursorY: number): void {
    const dt = dtMs / 1000;
    for (const spark of this.sparks.items) {
      if (!spark.active) continue;
      spark.life -= dtMs;
      if (spark.life <= 0) {
        this.sparks.release(spark);
        continue;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= 0.94;
      spark.vy = spark.vy * 0.94 + 220 * dt;
    }
    for (const marker of this.markers.items) {
      if (!marker.active) continue;
      marker.life -= dtMs;
      if (marker.life <= 0) this.markers.release(marker);
    }
  }

  tap(x: number, y: number, ts: number, _elapsedMs: number): boolean {
    const cell = this.hitTest(x, y);
    if (cell < 0) {
      this.misses++;
      this.streak = 0;
      return false;
    }
    const slot = this.slots[cell] as Slot;
    this.hits++;
    this.streak++;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    this.latencySum += Math.max(0, ts - slot.spawnTs);
    this.latencyCount++;

    const p = this.cellPixel(cell);
    this.emitHit(p.x, p.y);
    slot.active = false;
    this.spawn(ts);
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const w = this.world.w;
    const h = this.world.h;
    const size = Math.min(w, h) * GRID_FRACTION;
    const originX = (w - size) / 2;
    const originY = (h - size) / 2;

    ctx.fillStyle = PALETTE.field;
    ctx.fillRect(0, 0, w, h);

    // Grid: cell separators plus corner ticks, drawn as instrument registration
    // marks rather than decoration.
    const pitch = size / GRID;
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID; i++) {
      const gx = originX + i * pitch;
      const gy = originY + i * pitch;
      ctx.moveTo(gx, originY);
      ctx.lineTo(gx, originY + size);
      ctx.moveTo(originX, gy);
      ctx.lineTo(originX + size, gy);
    }
    ctx.stroke();

    ctx.strokeStyle = PALETTE.gridStrong;
    ctx.beginPath();
    const tick = Math.min(18, pitch * 0.14);
    for (const [cx, cy] of [
      [originX, originY],
      [originX + size, originY],
      [originX, originY + size],
      [originX + size, originY + size],
    ] as const) {
      const sx = cx === originX ? 1 : -1;
      const sy = cy === originY ? 1 : -1;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + tick * sx, cy);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + tick * sy);
    }
    ctx.stroke();

    const radius = size * this.radiusScale;
    for (let cell = 0; cell < CELLS; cell++) {
      const slot = this.slots[cell] as Slot;
      if (!slot.active) continue;
      const px = originX + (CELL_NX[cell] as number) * size;
      const py = originY + (CELL_NY[cell] as number) * size;
      this.drawTarget(ctx, px, py, radius);
    }

    ctx.lineWidth = 1.5;
    for (const marker of this.markers.items) {
      if (!marker.active) continue;
      const progress = 1 - marker.life / marker.ttl;
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = PALETTE.hit;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, marker.radius * (1 + progress * 1.6), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    for (const spark of this.sparks.items) {
      if (!spark.active) continue;
      const a = Math.min(1, spark.life / spark.ttl);
      ctx.globalAlpha = a;
      ctx.fillStyle = PALETTE.hit;
      ctx.fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
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
    const w = this.world.w;
    const h = this.world.h;
    const size = Math.min(w, h) * GRID_FRACTION;
    const originX = (w - size) / 2;
    const originY = (h - size) / 2;
    const r = size * this.radiusScale;
    const points: AimPoint[] = [];
    for (let cell = 0; cell < CELLS; cell++) {
      if (!(this.slots[cell] as Slot).active) continue;
      points.push({
        x: originX + (CELL_NX[cell] as number) * size,
        y: originY + (CELL_NY[cell] as number) * size,
        r,
      });
    }
    return points;
  }

  private drawTarget(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.target;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = PALETTE.targetRing;
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.targetInner;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.6, r * 0.09), 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.targetRing;
    ctx.fill();
  }

  private emitHit(x: number, y: number): void {
    const marker = this.markers.acquire();
    if (marker) {
      marker.x = x;
      marker.y = y;
      marker.life = 260;
      marker.ttl = 260;
      marker.radius = Math.max(18, Math.min(this.world.w, this.world.h) * 0.035);
    }
    for (let i = 0; i < 6; i++) {
      const spark = this.sparks.acquire();
      if (!spark) return;
      const angle = (i / 6) * Math.PI * 2 + this.rng.next() * 0.7;
      const speed = 160 + this.rng.next() * 220;
      spark.x = x;
      spark.y = y;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.life = 320 + this.rng.next() * 180;
      spark.ttl = spark.life;
    }
  }

  /** Returns the hit cell index, or -1. */
  private hitTest(x: number, y: number): number {
    const w = this.world.w;
    const h = this.world.h;
    const size = Math.min(w, h) * GRID_FRACTION;
    const originX = (w - size) / 2;
    const originY = (h - size) / 2;
    const r = size * this.radiusScale;
    for (let cell = 0; cell < CELLS; cell++) {
      if (!(this.slots[cell] as Slot).active) continue;
      const dx = originX + (CELL_NX[cell] as number) * size - x;
      const dy = originY + (CELL_NY[cell] as number) * size - y;
      if (dx * dx + dy * dy <= r * r) return cell;
    }
    return -1;
  }

  private cellPixel(cell: number): { x: number; y: number } {
    const w = this.world.w;
    const h = this.world.h;
    const size = Math.min(w, h) * GRID_FRACTION;
    return {
      x: (w - size) / 2 + (CELL_NX[cell] as number) * size,
      y: (h - size) / 2 + (CELL_NY[cell] as number) * size,
    };
  }

  private spawn(spawnTs: number): void {
    const cell = this.pickFreeCell();
    if (cell < 0) return;
    const slot = this.slots[cell] as Slot;
    slot.active = true;
    slot.spawnTs = spawnTs;
  }

  /** Rejection sampling, deterministic for a given RNG state. */
  private pickFreeCell(): number {
    for (let attempt = 0; attempt < 32; attempt++) {
      const cell = this.rng.int(CELLS);
      if (!(this.slots[cell] as Slot).active) return cell;
    }
    for (let cell = 0; cell < CELLS; cell++) {
      if (!(this.slots[cell] as Slot).active) return cell;
    }
    return -1;
  }
}
