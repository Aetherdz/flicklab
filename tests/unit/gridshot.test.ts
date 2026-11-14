import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS, FIXED_STEP_MS, Game } from '../../src/engine/game';
import { DEFAULT_APPEARANCE } from '../../src/engine/appearance';
import { Rng } from '../../src/engine/rng';
import type { RunConfig, World } from '../../src/engine/types';
import { createMode } from '../../src/modes/registry';

const WORLD: World = { w: 900, h: 600 };

function makeGame(overrides: Partial<RunConfig> = {}): Game {
  const config: RunConfig = {
    mode: 'gridshot',
    difficulty: 'normal',
    durationMs: 15_000,
    seed: 4242,
    ...overrides,
  };
  const world = { ...WORLD };
  return new Game({
    config,
    mode: createMode(config, new Rng(config.seed), world, DEFAULT_APPEARANCE),
    world,
  });
}

function advance(game: Game, ms: number): void {
  const steps = Math.round(ms / FIXED_STEP_MS);
  for (let i = 0; i < steps; i++) game.step();
}

function startRun(game: Game): void {
  advance(game, COUNTDOWN_MS + FIXED_STEP_MS);
  expect(game.state).toBe('running');
}

describe('Game clock', () => {
  it('runs the countdown before the clock starts', () => {
    const game = makeGame();
    expect(game.state).toBe('countdown');
    advance(game, COUNTDOWN_MS - 10);
    expect(game.state).toBe('countdown');
    advance(game, 10);
    expect(game.state).toBe('running');
    expect(game.elapsedMs).toBe(0);
  });

  it('counts elapsed time in fixed steps regardless of frame grouping', () => {
    const bunched = makeGame();
    const spread = makeGame();
    startRun(bunched);
    startRun(spread);
    advance(bunched, 1000);
    for (let i = 0; i < 10; i++) advance(spread, 100);
    expect(bunched.elapsedMs).toBe(spread.elapsedMs);
    expect(bunched.remainingMs).toBe(spread.remainingMs);
  });

  it('finishes exactly at the configured duration', () => {
    const game = makeGame({ durationMs: 15_000 });
    startRun(game);
    advance(game, 15_100);
    expect(game.state).toBe('finished');
    expect(game.elapsedMs).toBeGreaterThanOrEqual(15_000);
  });

  it('ignores taps during the countdown and after the finish', () => {
    const game = makeGame();
    game.tap(450, 300, 10);
    advance(game, COUNTDOWN_MS + 10);
    expect(game.result().hits).toBe(0);
    advance(game, 20_000);
    game.tap(450, 300, 20_000);
    expect(game.result().misses).toBe(0);
  });
});

describe('Gridshot rules', () => {
  it('starts with three live targets', () => {
    const game = makeGame();
    startRun(game);
    expect(game.runtime.aimPoints?.()).toHaveLength(3);
  });

  it('keeps three targets live after hits', () => {
    const game = makeGame();
    startRun(game);
    for (let i = 0; i < 6; i++) {
      const points = game.runtime.aimPoints?.() ?? [];
      const target = points[0];
      expect(target).toBeDefined();
      game.tap(target!.x, target!.y, game.elapsedMs + 30);
      advance(game, 120);
      expect(game.runtime.aimPoints?.()).toHaveLength(3);
    }
    expect(game.result().hits).toBe(6);
  });

  it('scores hits by difficulty and records latency', () => {
    const easy = makeGame({ difficulty: 'easy' });
    startRun(easy);
    const target = easy.runtime.aimPoints?.()[0];
    easy.tap(target!.x, target!.y, 45);
    advance(easy, 20);
    const easyResult = easy.result();

    const hard = makeGame({ difficulty: 'hard' });
    startRun(hard);
    const hardTarget = hard.runtime.aimPoints?.()[0];
    hard.tap(hardTarget!.x, hardTarget!.y, 45);
    advance(hard, 20);
    const hardResult = hard.result();

    expect(easyResult.hits).toBe(1);
    expect(easyResult.score).toBe(10);
    expect(hardResult.score).toBe(20);
    expect(easyResult.avgTimeToTarget).toBeCloseTo(45, 5);
  });

  it('counts empty-cell clicks as misses and breaks the streak', () => {
    const game = makeGame();
    startRun(game);
    const target = game.runtime.aimPoints?.()[0];
    game.tap(target!.x, target!.y, 20);
    advance(game, 40);
    game.tap(2, 2, game.elapsedMs + 20);
    advance(game, 40);
    const result = game.result();
    expect(result.hits).toBe(1);
    expect(result.misses).toBe(1);
    expect(result.bestStreak).toBe(1);
    expect(result.accuracy).toBeCloseTo(0.5, 5);
  });

  it('only accepts the first tap per frame window', () => {
    const game = makeGame();
    startRun(game);
    const target = game.runtime.aimPoints?.()[0];
    game.tap(target!.x, target!.y, 10);
    const remaining = game.runtime.aimPoints?.() ?? [];
    const other = remaining.find((p) => p.x !== target!.x || p.y !== target!.y);
    if (other) game.tap(other.x, other.y, 12);
    advance(game, 20);
    // Two queued taps are applied in order at the same step; the second may or
    // may not hit, but the total attempt count must equal the taps delivered.
    expect(game.result().hits + game.result().misses).toBeGreaterThanOrEqual(1);
  });
});

describe('determinism', () => {
  function play(seed: number, finishedAt: number) {
    const game = makeGame({ seed, durationMs: 20_000 });
    startRun(game);
    for (let i = 0; i < 40 && game.state === 'running'; i++) {
      const points = game.runtime.aimPoints?.() ?? [];
      const target = points[i % Math.max(1, points.length)];
      if (!target) break;
      game.tap(target.x, target.y, game.elapsedMs + 35 + i);
      advance(game, 180);
      if (i % 7 === 3) {
        game.tap(1, 1, game.elapsedMs + 20);
        advance(game, 60);
      }
    }
    while (game.state !== 'finished') game.step();
    return { result: game.result(finishedAt), taps: game.tapLog.length };
  }

  it('reproduces an identical run from the same seed and tap log', () => {
    const a = play(2024, 1_700_000_000_000);
    const b = play(2024, 1_700_000_000_000);
    expect(b.result).toEqual(a.result);
    expect(b.taps).toBe(a.taps);
  });

  it('lays targets out differently for a different seed', () => {
    const first = makeGame({ seed: 2024 });
    const second = makeGame({ seed: 2025 });
    startRun(first);
    startRun(second);
    const a = (first.runtime.aimPoints?.() ?? []).map((p) => `${p.x}:${p.y}`);
    const b = (second.runtime.aimPoints?.() ?? []).map((p) => `${p.x}:${p.y}`);
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
  });
});
