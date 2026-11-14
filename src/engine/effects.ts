import { Pool } from './pool';

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
}

interface Ring {
  active: boolean;
  x: number;
  y: number;
  r: number;
  life: number;
  ttl: number;
}

/**
 * Small pooled hit feedback shared by the aiming modes: a ring that expands
 * and a fixed ring of sparks. No allocations, no RNG, so it cannot affect the
 * determinism of a run.
 */
export class Effects {
  private readonly sparks: Pool<Spark>;
  private readonly rings: Pool<Ring>;

  constructor(sparkCount = 48, ringCount = 8) {
    this.sparks = new Pool<Spark>(sparkCount, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      ttl: 0,
    }));
    this.rings = new Pool<Ring>(ringCount, () => ({
      active: false,
      x: 0,
      y: 0,
      r: 0,
      life: 0,
      ttl: 0,
    }));
  }

  clear(): void {
    this.sparks.clear();
    this.rings.clear();
  }

  burst(x: number, y: number, power = 1): void {
    for (let i = 0; i < 8; i++) {
      const spark = this.sparks.acquire();
      if (!spark) return;
      const angle = (i / 8) * Math.PI * 2;
      const speed = (150 + i * 14) * power;
      spark.x = x;
      spark.y = y;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.life = 260 + i * 10;
      spark.ttl = spark.life;
    }
  }

  ring(x: number, y: number, radius: number): void {
    const ring = this.rings.acquire();
    if (!ring) return;
    ring.x = x;
    ring.y = y;
    ring.r = radius;
    ring.life = 280;
    ring.ttl = 280;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const sparks = this.sparks.items;
    for (let i = 0; i < sparks.length; i++) {
      const spark = sparks[i] as Spark;
      if (!spark.active) continue;
      spark.life -= dtMs;
      if (spark.life <= 0) {
        this.sparks.release(spark);
        continue;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= 0.93;
      spark.vy = spark.vy * 0.93 + 240 * dt;
    }
    const rings = this.rings.items;
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i] as Ring;
      if (!ring.active) continue;
      ring.life -= dtMs;
      if (ring.life <= 0) this.rings.release(ring);
    }
  }

  draw(ctx: CanvasRenderingContext2D, color: string): void {
    const rings = this.rings.items;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i] as Ring;
      if (!ring.active) continue;
      const progress = 1 - ring.life / ring.ttl;
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r * (1 + progress * 1.5), 0, Math.PI * 2);
      ctx.stroke();
    }

    const sparks = this.sparks.items;
    ctx.fillStyle = color;
    for (let i = 0; i < sparks.length; i++) {
      const spark = sparks[i] as Spark;
      if (!spark.active) continue;
      ctx.globalAlpha = Math.min(1, spark.life / spark.ttl);
      ctx.fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }
}
