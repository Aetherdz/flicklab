import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, type Appearance } from '../../src/engine/appearance';
import { COUNTDOWN_MS, FIXED_STEP_MS, Game } from '../../src/engine/game';
import { Rng } from '../../src/engine/rng';
import type { ModeId, RunConfig, World } from '../../src/engine/types';
import { createMode } from '../../src/modes/registry';

const WORLD: World = { w: 1000, h: 600 };

function makeGame(
  mode: ModeId,
  overrides: Partial<RunConfig> = {},
  look: Appearance = DEFAULT_APPEARANCE,
): { game: Game; world: World } {
  const config: RunConfig = {
    mode,
    difficulty: 'normal',
    durationMs: 15_000,
    seed: 4242,
    ...overrides,
  };
  const world = { ...WORLD };
  return {
    game: new Game({
      config,
      mode: createMode(config, new Rng(config.seed), world, look),
      world,
    }),
    world,
  };
}

function advance(game: Game, ms: number): void {
  const steps = Math.round(ms / FIXED_STEP_MS);
  for (let i = 0; i < steps; i++) game.step();
}

function startRun(game: Game): void {
  advance(game, COUNTDOWN_MS + FIXED_STEP_MS);
  expect(game.state).toBe('running');
}

function onlyPoint(game: Game): { x: number; y: number; r: number } {
  const points = game.runtime.aimPoints?.() ?? [];
  expect(points).toHaveLength(1);
  return points[0] as { x: number; y: number; r: number };
}

describe('Flick', () => {
  it('moves the target after every hit and records the latency', () => {
    const { game } = makeGame('flick');
    startRun(game);
    const first = onlyPoint(game);
    game.tap(first.x, first.y, 120);
    advance(game, 40);

    const second = onlyPoint(game);
    expect(`${second.x}:${second.y}`).not.toBe(`${first.x}:${first.y}`);
    expect(game.result().hits).toBe(1);
    expect(game.result().avgTimeToTarget).toBeCloseTo(120, 5);
  });

  it('keeps the target in place after a miss', () => {
    const { game } = makeGame('flick');
    startRun(game);
    const before = onlyPoint(game);
    game.tap(1, 1, 50);
    advance(game, 40);
    const after = onlyPoint(game);

    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(game.result().misses).toBe(1);
    expect(game.result().hits).toBe(0);
  });

  it('is reproducible from the seed', () => {
    const a = makeGame('flick', { seed: 9001 });
    const b = makeGame('flick', { seed: 9001 });
    startRun(a.game);
    startRun(b.game);
    expect(onlyPoint(a.game)).toEqual(onlyPoint(b.game));

    for (const run of [a.game, b.game]) {
      const point = onlyPoint(run);
      run.tap(point.x, point.y, 90);
      advance(run, 40);
    }
    expect(onlyPoint(a.game)).toEqual(onlyPoint(b.game));
  });
});

describe('Tracking', () => {
  it('scores the share of samples spent on target', () => {
    const { game } = makeGame('tracking');
    startRun(game);
    expect(game.result().onTargetRatio).toBe(0);

    for (let i = 0; i < 120; i++) {
      const point = onlyPoint(game);
      game.setCursor(point.x, point.y);
      game.step();
    }

    const ratio = game.result().onTargetRatio ?? 0;
    expect(ratio).toBeGreaterThan(0.95);

    for (let i = 0; i < 120; i++) {
      game.setCursor(1, 1);
      game.step();
    }
    const mixed = game.result().onTargetRatio ?? 0;
    expect(mixed).toBeGreaterThan(0.4);
    expect(mixed).toBeLessThan(0.6);
  });

  it('ignores clicks and samples the cursor position instead', () => {
    const { game } = makeGame('tracking');
    startRun(game);
    for (let i = 0; i < 60; i++) {
      const point = onlyPoint(game);
      game.setCursor(point.x, point.y);
      game.step();
    }
    const point = onlyPoint(game);
    game.tap(1, 1, 100);
    game.setCursor(point.x, point.y);
    game.step();

    // A click far from the target neither scores a hit nor moves the cursor.
    expect(game.result().onTargetRatio ?? 0).toBeGreaterThan(0.95);
  });

  it('keeps a deterministic path for a seed', () => {
    const a = makeGame('tracking', { seed: 77 });
    const b = makeGame('tracking', { seed: 77 });
    startRun(a.game);
    startRun(b.game);
    advance(a.game, 2000);
    advance(b.game, 2000);
    expect(onlyPoint(a.game)).toEqual(onlyPoint(b.game));
  });
});

describe('Precision', () => {
  it('shrinks the target after a hit and restores it after a miss', () => {
    const { game } = makeGame('precision');
    startRun(game);
    const startRadius = onlyPoint(game).r;

    let point = onlyPoint(game);
    game.tap(point.x, point.y, 100);
    advance(game, 40);
    const shrunk = onlyPoint(game).r;
    expect(shrunk).toBeLessThan(startRadius);

    point = onlyPoint(game);
    game.tap(1, 1, 200);
    advance(game, 40);
    const restored = onlyPoint(game).r;
    expect(restored).toBeCloseTo(startRadius, 5);

    // The size resets on the next hit only after another miss-free hit chain.
    point = onlyPoint(game);
    game.tap(point.x, point.y, 300);
    advance(game, 40);
    expect(game.result().hits).toBe(2);
    expect(game.result().misses).toBe(1);
  });

  it('scores hits only, with the difficulty multiplier', () => {
    const easy = makeGame('precision', { difficulty: 'easy' });
    const hard = makeGame('precision', { difficulty: 'hard' });
    startRun(easy.game);
    startRun(hard.game);

    for (const run of [easy.game, hard.game]) {
      const point = onlyPoint(run);
      run.tap(point.x, point.y, 80);
      advance(run, 40);
    }
    expect(easy.game.result().score).toBe(10);
    expect(hard.game.result().score).toBe(20);
  });
});

describe('Reaction', () => {
  it('runs five trials, finishes early and measures valid trials only', () => {
    const { game } = makeGame('reaction', { durationMs: 60_000 });
    startRun(game);

    for (let trial = 0; trial < 5; trial++) {
      let waited = 0;
      while ((game.runtime.aimPoints?.() ?? []).length === 0 && waited < 5000) {
        advance(game, 50);
        waited += 50;
      }
      const point = onlyPoint(game);
      game.tap(point.x, point.y, game.elapsedMs + 60);
      advance(game, 20);
    }

    expect(game.state).toBe('finished');
    expect(game.elapsedMs).toBeLessThan(60_000);
    const result = game.result();
    expect(result.hits).toBe(5);
    expect(result.misses).toBe(0);
    expect(result.avgTimeToTarget).not.toBeNull();
    expect(result.avgTimeToTarget as number).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it('records an early click as a false start and moves on', () => {
    const { game } = makeGame('reaction');
    startRun(game);
    game.tap(500, 300, 10);
    advance(game, 40);

    const result = game.result();
    expect(result.misses).toBe(1);
    expect(result.hits).toBe(0);
  });

  it('reports trial progress', () => {
    const { game } = makeGame('reaction');
    startRun(game);
    expect(game.runtime.progress?.()).toEqual({ label: 'hud.trial', value: '1/5' });
  });
});

describe('CPS', () => {
  it('counts pad clicks and ignores clicks outside', () => {
    const { game } = makeGame('cps', { durationMs: 10_000 });
    startRun(game);
    const point = onlyPoint(game);

    for (let i = 0; i < 10; i++) {
      game.tap(point.x, point.y, 100 + i * 80);
      advance(game, 40);
    }
    game.tap(2, 2, 2000);
    advance(game, 40);

    const result = game.result();
    expect(result.hits).toBe(10);
    expect(result.misses).toBe(1);
    expect(result.score).toBeGreaterThan(0);
  });

  it('filters electrical bounce from a single physical click', () => {
    const { game } = makeGame('cps');
    startRun(game);
    const point = onlyPoint(game);
    game.tap(point.x, point.y, 1000);
    game.tap(point.x, point.y, 1010);
    advance(game, 40);
    expect(game.result().hits).toBe(1);
  });

  it('scores a sustained click rate', () => {
    const { game } = makeGame('cps', { durationMs: 5000 });
    startRun(game);
    const point = onlyPoint(game);
    for (let i = 0; i < 20; i++) {
      game.tap(point.x, point.y, 100 + i * 100);
      advance(game, 100);
    }
    advance(game, 4000);
    const result = game.result();
    expect(result.score).toBeGreaterThan(0);
    expect(result.accuracy).toBe(1);
  });
});

describe('appearance', () => {
  it('scales every target radius', () => {
    const large: Appearance = { ...DEFAULT_APPEARANCE, targetScale: 1.4 };
    const small: Appearance = { ...DEFAULT_APPEARANCE, targetScale: 0.7 };
    const modes: ModeId[] = ['gridshot', 'flick', 'tracking', 'precision'];

    for (const mode of modes) {
      const big = makeGame(mode, { difficulty: 'hard' }, large);
      const tiny = makeGame(mode, { difficulty: 'hard' }, small);
      startRun(big.game);
      startRun(tiny.game);
      const bigRadius = (big.game.runtime.aimPoints?.() ?? [])[0]?.r ?? 0;
      const tinyRadius = (tiny.game.runtime.aimPoints?.() ?? [])[0]?.r ?? 0;
      expect(bigRadius).toBeGreaterThan(tinyRadius * 1.5);
    }
  });
});
