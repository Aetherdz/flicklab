import type { Appearance } from './appearance';
import { Effects } from './effects';
import { HIT_COLOR } from './palette';
import { Rng } from './rng';
import { drawField, drawTarget } from './targets';
import { TARGET_RADIUS } from './theme';
import type { Difficulty } from './types';

const COUNT = 3;
/** Normalised screen heights per second. Slow enough to read, fast enough to feel alive. */
const SPEED = 0.055;
/** Target radius per difficulty, shared with the run modes so preview matches play. */
const RADIUS = TARGET_RADIUS;
const MARGIN = 0.08;
/** How quickly velocity eases toward the desired heading (per second). */
const STEER = 4.5;
/** Per-target dwell time between desired heading changes, in seconds. */
const TURN_MIN = 0.7;
const TURN_MAX = 2.8;
/** Weapon aim easing rate (per second). */
const AIM_STEER = 16;
/** Barrel is kept inside this cone around straight up, in radians. */
const AIM_SPREAD = 1.32;
const TRACER_MS = 150;
const MUZZLE_MS = 90;

interface Drifter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Desired velocity the current one steers toward. */
  dvx: number;
  dvy: number;
  /** Seconds of field time until this target picks a new desired heading. */
  turnIn: number;
}

interface Shot {
  x: number;
  y: number;
  life: number;
  ttl: number;
}

/**
 * The field shown before a run starts: three targets drifting across the grid.
 * Clicking one pops it and it reappears elsewhere, so the first thing a visitor
 * does on the site is aim at something.
 *
 * Each target keeps its own steering state: a desired heading and speed that it
 * eases toward, re-rolled on its own timer. Nothing is shared between targets,
 * so they never turn in unison, and every path decision comes from this field's
 * private RNG so a run's deterministic stream is untouched.
 *
 * This is deliberately not a mode: it is cosmetic, it never feeds a score.
 */
export class AttractField {
  private readonly effects = new Effects(48, 8);
  private readonly items: Drifter[] = [];
  private readonly rng: Rng;
  private w = 0;
  private h = 0;
  private time = 0;
  private pops = 0;

  private aimX = 0;
  private aimY = 0;
  private aimAngle = -Math.PI / 2;
  private aimReady = false;
  private shot: Shot | null = null;
  private muzzle = 0;

  constructor(
    private readonly look: Appearance,
    seed?: number,
    private readonly difficulty: Difficulty = 'normal',
  ) {
    const seedValue = seed !== undefined ? seed : ((Date.now() ^ 0x9e3779b9) >>> 0) || 1;
    this.rng = new Rng(seedValue);

    for (let i = 0; i < COUNT; i++) {
      this.items.push({ x: 0, y: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, turnIn: 0 });
    }
    for (let i = 0; i < this.items.length; i++) this.place(this.items[i] as Drifter, i);
  }

  get score(): number {
    return this.pops;
  }

  setWorld(w: number, h: number): void {
    const first = this.w < 2 || this.h < 2;
    this.w = w;
    this.h = h;
    if (first) {
      for (let i = 0; i < this.items.length; i++) this.place(this.items[i] as Drifter, i);
      return;
    }
    // A resize must not teleport targets off the field.
    const pad = this.pad();
    for (const item of this.items) {
      item.x = Math.min(1 - pad.x, Math.max(pad.x, item.x));
      item.y = Math.min(1 - pad.y, Math.max(pad.y, item.y));
    }
  }

  /** Aim in canvas CSS pixels. Tap points snap here as well as pointer moves. */
  setAim(x: number, y: number): void {
    if (this.w < 2 || this.h < 2) return;
    this.aimX = Math.min(this.w, Math.max(0, x));
    this.aimY = Math.min(this.h, Math.max(0, y));
    const target = this.aimAt(this.aimX, this.aimY);
    // Without a previous sample, or with reduced motion, the barrel is already there.
    if (!this.aimReady || this.look.reducedMotion) {
      this.aimAngle = target;
      this.aimReady = true;
    }
  }

  update(dtMs: number): void {
    const dt = Math.min(50, dtMs) / 1000;
    this.time += dt;
    this.effects.update(dtMs);
    this.ageShot(dtMs);

    if (this.look.reducedMotion) {
      // Nothing moves: no drift, no tracer, no particles.
      for (const item of this.items) {
        item.vx = 0;
        item.vy = 0;
      }
      this.clearShot();
      this.effects.clear();
      return;
    }

    for (const item of this.items) {
      item.turnIn -= dt;
      if (item.turnIn <= 0) this.retarget(item);

      // Ease toward the desired heading: no direction teleport, only a turn.
      const k = Math.min(1, STEER * dt);
      item.vx += (item.dvx - item.vx) * k;
      item.vy += (item.dvy - item.vy) * k;

      item.x += item.vx * dt;
      item.y += item.vy * dt;
      this.reflect(item);
    }

    this.steerAim(dt);
  }

  /** Returns true when the click landed on a target. */
  tap(x: number, y: number): boolean {
    // A shot snaps the barrel to the tap even if the pointer never moved.
    this.setAim(x, y);
    this.aimAngle = this.aimAt(this.aimX, this.aimY);
    this.aimReady = true;
    this.fire(x, y);

    const r = this.radiusPx();
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i] as Drifter;
      const dx = item.x * this.w - x;
      const dy = item.y * this.h - y;
      if (dx * dx + dy * dy > r * r) continue;

      this.pops++;
      if (!this.look.reducedMotion) {
        this.effects.burst(item.x * this.w, item.y * this.h, 0.8);
        this.effects.ring(item.x * this.w, item.y * this.h, r);
      }
      this.place(item, i);
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this;
    if (w < 2 || h < 2) return;
    const theme = this.look.theme;
    drawField(ctx, w, h, theme.field, theme.grid, theme.gridStrong);

    // The weapon sits under the targets so no target is ever hidden by it.
    this.drawWeapon(ctx);

    // A slow pulse keeps the field alive even with reduced motion on.
    const pulse = this.look.reducedMotion ? 1 : 1 + Math.sin(this.time * 2.2) * 0.035;
    const r = this.radiusPx() * pulse;
    for (const item of this.items) {
      drawTarget(ctx, item.x * w, item.y * h, r, {
        ...this.look.target,
        shape: this.look.shape,
      });
    }
    this.effects.draw(ctx, HIT_COLOR);
    this.drawShot(ctx);
  }

  aimPoints(): { x: number; y: number; r: number }[] {
    const r = this.radiusPx();
    return this.items.map((item) => ({ x: item.x * this.w, y: item.y * this.h, r }));
  }

  private radiusPx(): number {
    return Math.min(this.w, this.h) * RADIUS[this.difficulty] * this.look.targetScale;
  }

  /** Half-extents that keep a whole target circle inside the field. */
  private pad(): { x: number; y: number } {
    const r = this.radiusPx();
    return {
      x: Math.min(0.45, Math.max(MARGIN, r / Math.max(1, this.w))),
      y: Math.min(0.45, Math.max(MARGIN, r / Math.max(1, this.h))),
    };
  }

  private place(item: Drifter, index: number): void {
    const pad = this.pad();
    // Keep the three targets apart so they never read as one blob.
    let bestX = 0.5;
    let bestY = 0.5;
    let bestGap = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = pad.x + this.rng.next() * (1 - pad.x * 2);
      const y = pad.y + this.rng.next() * (1 - pad.y * 2);
      let gap = Infinity;
      for (let other = 0; other < this.items.length; other++) {
        if (other === index) continue;
        const candidate = this.items[other] as Drifter;
        gap = Math.min(gap, Math.hypot(candidate.x - x, candidate.y - y));
      }
      if (gap > bestGap) {
        bestGap = gap;
        bestX = x;
        bestY = y;
      }
      if (gap > 0.22) break;
    }
    item.x = bestX;
    item.y = bestY;
    this.retarget(item);
    item.vx = item.dvx;
    item.vy = item.dvy;
  }

  /** Rolls this target's next desired heading, speed and dwell time. */
  private retarget(item: Drifter): void {
    const angle = this.rng.next() * Math.PI * 2;
    const speed = SPEED * (0.7 + this.rng.next() * 0.6);
    // Equal pixel speed on both axes: normalise the x component by the aspect.
    const aspect = this.w > 0 ? this.h / this.w : 1;
    item.dvx = Math.cos(angle) * speed * aspect;
    item.dvy = Math.sin(angle) * speed;
    item.turnIn = TURN_MIN + this.rng.next() * (TURN_MAX - TURN_MIN);
  }

  /** Reflects at the field edges and turns the desired heading inward too. */
  private reflect(item: Drifter): void {
    const pad = this.pad();
    if (item.x < pad.x) {
      item.x = pad.x;
      item.vx = Math.abs(item.vx);
      item.dvx = Math.abs(item.dvx);
    } else if (item.x > 1 - pad.x) {
      item.x = 1 - pad.x;
      item.vx = -Math.abs(item.vx);
      item.dvx = -Math.abs(item.dvx);
    }
    if (item.y < pad.y) {
      item.y = pad.y;
      item.vy = Math.abs(item.vy);
      item.dvy = Math.abs(item.dvy);
    } else if (item.y > 1 - pad.y) {
      item.y = 1 - pad.y;
      item.vy = -Math.abs(item.vy);
      item.dvy = -Math.abs(item.dvy);
    }
  }

  private steerAim(dt: number): void {
    if (!this.aimReady || this.look.reducedMotion) return;
    let delta = this.aimAt(this.aimX, this.aimY) - this.aimAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.aimAngle += delta * Math.min(1, AIM_STEER * dt);
  }

  /** Barrel angle from the pivot toward a point, clamped to an upward cone. */
  private aimAt(x: number, y: number): number {
    const unit = this.weaponUnit();
    const px = this.w / 2;
    const py = this.h - unit * 1.4;
    const dx = x - px;
    const dy = y - py;
    const up = -Math.PI / 2;
    const max = up + AIM_SPREAD;
    const min = up - AIM_SPREAD;
    if (dy > 0) return dx >= 0 ? max : min;
    const angle = Math.atan2(dy, dx);
    return Math.min(max, Math.max(min, angle));
  }

  private weaponUnit(): number {
    return Math.max(5, Math.min(this.w, this.h) * 0.026);
  }

  private muzzlePoint(): { x: number; y: number } {
    const unit = this.weaponUnit();
    const tip = unit * 9 * 0.99;
    const px = this.w / 2;
    const py = this.h - unit * 1.4;
    return {
      x: px + Math.cos(this.aimAngle) * tip,
      y: py + Math.sin(this.aimAngle) * tip,
    };
  }

  private fire(x: number, y: number): void {
    if (this.look.reducedMotion) return;
    this.shot = {
      x: Math.min(this.w, Math.max(0, x)),
      y: Math.min(this.h, Math.max(0, y)),
      life: TRACER_MS,
      ttl: TRACER_MS,
    };
    this.muzzle = MUZZLE_MS;
  }

  private ageShot(dtMs: number): void {
    if (this.shot) {
      this.shot.life -= dtMs;
      if (this.shot.life <= 0) this.shot = null;
    }
    if (this.muzzle > 0) this.muzzle = Math.max(0, this.muzzle - dtMs);
  }

  private clearShot(): void {
    this.shot = null;
    this.muzzle = 0;
  }

  /** Compact stylized side-profile weapon, pivoting at the lower edge. */
  private drawWeapon(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this;
    const unit = this.weaponUnit();
    const len = unit * 9;
    const thick = unit * 1.9;
    const theme = this.look.theme;

    ctx.save();
    ctx.translate(w / 2, h - unit * 1.4);
    ctx.rotate(this.aimAngle);

    // Stock.
    ctx.fillStyle = theme.grid;
    ctx.beginPath();
    ctx.moveTo(-len * 0.58, thick * 0.06);
    ctx.lineTo(-len * 0.2, -thick * 0.3);
    ctx.lineTo(-len * 0.2, thick * 0.32);
    ctx.lineTo(-len * 0.5, thick * 0.26);
    ctx.closePath();
    ctx.fill();

    // Receiver body.
    roundRect(ctx, -len * 0.24, -thick * 0.44, len * 0.66, thick * 0.88, unit * 0.4);
    ctx.fillStyle = theme.gridStrong;
    ctx.fill();
    ctx.lineWidth = Math.max(1, unit * 0.1);
    ctx.strokeStyle = theme.grid;
    ctx.stroke();

    // Grip.
    ctx.fillStyle = theme.grid;
    ctx.beginPath();
    ctx.moveTo(-len * 0.02, thick * 0.36);
    ctx.lineTo(len * 0.18, thick * 0.36);
    ctx.lineTo(len * 0.3, thick * 1.05);
    ctx.lineTo(len * 0.12, thick * 1.05);
    ctx.closePath();
    ctx.fill();

    // Barrel.
    roundRect(ctx, len * 0.36, -thick * 0.2, len * 0.52, thick * 0.3, unit * 0.18);
    ctx.fillStyle = theme.grid;
    ctx.fill();
    ctx.strokeStyle = theme.gridStrong;
    ctx.lineWidth = Math.max(1, unit * 0.08);
    ctx.stroke();

    // Muzzle brake.
    roundRect(ctx, len * 0.86, -thick * 0.28, len * 0.13, thick * 0.46, unit * 0.14);
    ctx.fillStyle = theme.gridStrong;
    ctx.fill();

    // Energy cell: the only saturated mark, and it is the target colour.
    ctx.fillStyle = this.look.target.target;
    roundRect(ctx, -len * 0.1, -thick * 0.62, len * 0.2, thick * 0.2, unit * 0.12);
    ctx.fill();

    // Top rail accent.
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = theme.ring;
    ctx.lineWidth = Math.max(1, unit * 0.11);
    ctx.beginPath();
    ctx.moveTo(-len * 0.16, -thick * 0.5);
    ctx.lineTo(len * 0.34, -thick * 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /** Short-lived tracer from the muzzle to the shot point, plus muzzle flare. */
  private drawShot(ctx: CanvasRenderingContext2D): void {
    if (this.look.reducedMotion) return;
    const unit = this.weaponUnit();
    const muzzle = this.muzzlePoint();

    if (this.shot) {
      const k = Math.max(0, this.shot.life / this.shot.ttl);
      ctx.save();
      ctx.globalAlpha = k * 0.9;
      ctx.strokeStyle = HIT_COLOR;
      ctx.lineWidth = Math.max(1, unit * 0.1);
      ctx.beginPath();
      ctx.moveTo(muzzle.x, muzzle.y);
      ctx.lineTo(this.shot.x, this.shot.y);
      ctx.stroke();
      ctx.globalAlpha = k;
      ctx.fillStyle = HIT_COLOR;
      ctx.beginPath();
      ctx.arc(this.shot.x, this.shot.y, Math.max(1.5, unit * 0.4 * k), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.muzzle > 0) {
      const k = this.muzzle / MUZZLE_MS;
      ctx.save();
      ctx.translate(muzzle.x, muzzle.y);
      ctx.rotate(this.aimAngle);
      ctx.globalAlpha = k;
      ctx.fillStyle = HIT_COLOR;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(unit * 1.9 * k, -unit * 0.5);
      ctx.lineTo(unit * 1.15 * k, 0);
      ctx.lineTo(unit * 1.9 * k, unit * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}