import { beforeAll, describe, expect, it } from 'vitest';
import { Loop } from '../../src/engine/loop';

beforeAll(() => {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    void cb;
    return 1;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
});

describe('Loop', () => {
  const frame = 1000 / 60;

  it('advances the simulation in fixed steps', () => {
    const loop = new Loop(1000 / 240);
    let steps = 0;
    loop.onStep(() => steps++);
    loop.onRender(() => {});
    loop.tick(0);
    for (let i = 1; i <= 60; i++) loop.tick(i * frame);
    // One second of frames is 240 steps, up to the fractional remainder.
    expect(Math.abs(steps - 240)).toBeLessThanOrEqual(1);
    expect(loop.stats.frames).toBe(61);
  });

  it('reports the same step total for uneven frame pacing', () => {
    const steady = new Loop(1000 / 240);
    const jittery = new Loop(1000 / 240);
    let steadySteps = 0;
    let jitterSteps = 0;
    steady.onStep(() => steadySteps++);
    jittery.onStep(() => jitterSteps++);
    steady.tick(0);
    jittery.tick(0);
    for (let i = 1; i <= 120; i++) steady.tick(i * frame);
    // 120 uneven frames that still add up to exactly two seconds.
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += i % 2 === 0 ? 8.3335 : 25;
      jittery.tick(t);
    }
    // Both cover two seconds; the remainder is at most one step.
    expect(Math.abs(steadySteps - jitterSteps)).toBeLessThanOrEqual(1);
    expect(Math.abs(steadySteps - 480)).toBeLessThanOrEqual(1);
  });

  it('caps catch-up work after a long stall', () => {
    const loop = new Loop(1000 / 240);
    let steps = 0;
    loop.onStep(() => steps++);
    loop.onRender(() => {});
    loop.tick(0);
    loop.tick(500); // tab was suspended
    expect(steps).toBeLessThanOrEqual(24);
    const before = steps;
    loop.tick(500 + frame);
    expect(steps - before).toBeLessThanOrEqual(4);
  });

  it('stops without scheduling new frames', () => {
    const loop = new Loop(1000 / 240);
    let rendered = 0;
    loop.onStep(() => {});
    loop.onRender(() => rendered++);
    loop.start(0);
    loop.stop();
    loop.tick(16);
    expect(rendered).toBe(1);
    expect(loop.running).toBe(false);
  });

  it('exposes frame cost statistics', () => {
    const loop = new Loop(1000 / 240);
    loop.onStep(() => {});
    loop.onRender(() => {});
    loop.tick(0);
    loop.tick(1000 / 60);
    expect(loop.stats.maxStepMs).toBeGreaterThanOrEqual(0);
    expect(loop.stats.totalRenderMs).toBeGreaterThanOrEqual(0);
    expect(loop.stats.longFrames).toBe(0);
  });
});
