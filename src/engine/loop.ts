/**
 * Fixed-timestep driver.
 *
 * Simulation advances in fixed quanta; rendering runs once per animation frame
 * with an interpolation factor. Frame boundaries therefore never change the
 * simulation content, which is what makes a run replayable from its event log.
 */

export const DEFAULT_FIXED_STEP_MS = 1000 / 240;
/** Hard ceiling on catch-up work after a stall (24 steps = 100 ms of sim). */
const MAX_CATCH_UP_STEPS = 24;
/** Anything longer than this is treated as a tab switch, not a slow frame. */
const MAX_FRAME_MS = 250;

export interface LoopStats {
  frames: number;
  steps: number;
  longFrames: number;
  lastFrameMs: number;
  maxFrameMs: number;
  totalStepMs: number;
  maxStepMs: number;
  totalRenderMs: number;
  maxRenderMs: number;
}

export class Loop {
  readonly stats: LoopStats = {
    frames: 0,
    steps: 0,
    longFrames: 0,
    lastFrameMs: 0,
    maxFrameMs: 0,
    totalStepMs: 0,
    maxStepMs: 0,
    totalRenderMs: 0,
    maxRenderMs: 0,
  };

  private rafId = 0;
  private last = 0;
  private acc = 0;
  private active = false;
  private stepCb: (dtMs: number) => void = () => {};
  private renderCb: (alpha: number, frameMs: number) => void = () => {};

  constructor(readonly fixedStepMs: number = DEFAULT_FIXED_STEP_MS) {}

  onStep(cb: (dtMs: number) => void): void {
    this.stepCb = cb;
  }

  onRender(cb: (alpha: number, frameMs: number) => void): void {
    this.renderCb = cb;
  }

  get running(): boolean {
    return this.active;
  }

  start(now: number = performance.now()): void {
    if (this.active) return;
    this.active = true;
    this.last = now;
    this.acc = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.active = false;
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Drops accumulated time without touching the simulation (used on resume). */
  resetClock(now: number = performance.now()): void {
    this.last = now;
    this.acc = 0;
  }

  /** One frame of work. Public so tests can drive it without rAF. */
  tick(now: number): void {
    let delta = now - this.last;
    this.last = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    const frameMs = delta;
    if (delta > MAX_FRAME_MS) delta = MAX_FRAME_MS;

    this.acc += delta;
    let steps = 0;
    while (this.acc >= this.fixedStepMs && steps < MAX_CATCH_UP_STEPS) {
      this.acc -= this.fixedStepMs;
      const t0 = performance.now();
      this.stepCb(this.fixedStepMs);
      const stepMs = performance.now() - t0;
      this.stats.totalStepMs += stepMs;
      if (stepMs > this.stats.maxStepMs) this.stats.maxStepMs = stepMs;
      steps++;
    }
    // Do not carry a stall-sized debt into the next frame.
    if (steps === MAX_CATCH_UP_STEPS) this.acc = 0;

    const r0 = performance.now();
    this.renderCb(this.acc / this.fixedStepMs, frameMs);
    const renderMs = performance.now() - r0;

    this.stats.frames++;
    this.stats.steps += steps;
    this.stats.lastFrameMs = frameMs;
    if (frameMs > this.stats.maxFrameMs && frameMs < MAX_FRAME_MS) this.stats.maxFrameMs = frameMs;
    if (frameMs > 24) this.stats.longFrames++;
    this.stats.totalRenderMs += renderMs;
    if (renderMs > this.stats.maxRenderMs) this.stats.maxRenderMs = renderMs;
  }

  private readonly frame = (now: number): void => {
    if (!this.active) return;
    this.tick(now);
    if (this.active) this.rafId = requestAnimationFrame(this.frame);
  };
}
