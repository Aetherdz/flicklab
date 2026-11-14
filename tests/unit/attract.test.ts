import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, type Appearance } from '../../src/engine/appearance';
import { AttractField } from '../../src/engine/attract';
import { TARGET_RADIUS } from '../../src/engine/theme';
import type { Difficulty } from '../../src/engine/types';

const STEP_MS = 16.7;

function make(
  seed = 12345,
  look: Appearance = DEFAULT_APPEARANCE,
  w = 800,
  h = 600,
  difficulty: Difficulty = 'normal',
): AttractField {
  const field = new AttractField(look, seed, difficulty);
  field.setWorld(w, h);
  return field;
}

function run(field: AttractField, steps: number, dtMs = STEP_MS): void {
  for (let i = 0; i < steps; i++) field.update(dtMs);
}

function first(field: AttractField): { x: number; y: number; r: number } {
  const [point] = field.aimPoints();
  if (!point) throw new Error('expected at least one target');
  return point;
}

describe('AttractField paths', () => {
  it('replays identical paths for the same seed', () => {
    const a = make(4242);
    const b = make(4242);
    expect(a.aimPoints()).toEqual(b.aimPoints());

    run(a, 400);
    run(b, 400);
    expect(a.aimPoints()).toEqual(b.aimPoints());
  });

  it('gives targets different paths from the same seed', () => {
    const field = make(4242);
    run(field, 1);
    const points = field.aimPoints();
    expect(points).toHaveLength(3);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        if (!a || !b) throw new Error('expected three targets');
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
      }
    }
  });

  it('curves at least one path instead of holding one line', () => {
    const field = make(90210);
    const start = first(field);

    // Headings measured over a short window so reflections do not dominate.
    const headings: number[] = [];
    const sampled: { x: number; y: number }[] = [start];
    let prev = start;
    for (let i = 0; i < 900; i++) {
      field.update(STEP_MS);
      const point = first(field);
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      if (Math.hypot(dx, dy) > 0.25) headings.push(Math.atan2(dy, dx));
      sampled.push(point);
      prev = point;
    }

    const base = headings[0] ?? 0;
    let widestTurn = 0;
    for (const heading of headings) {
      let delta = Math.abs(heading - base);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      widestTurn = Math.max(widestTurn, delta);
    }
    expect(widestTurn).toBeGreaterThan(0.5);

    // And the route is not a straight line: it bows away from the start-end chord.
    const end = first(field);
    const chordX = end.x - start.x;
    const chordY = end.y - start.y;
    const chord = Math.hypot(chordX, chordY);
    expect(chord).toBeGreaterThan(1);
    let widestBow = 0;
    for (const point of sampled) {
      const bow = Math.abs((point.x - start.x) * chordY - (point.y - start.y) * chordX) / chord;
      widestBow = Math.max(widestBow, bow);
    }
    expect(widestBow).toBeGreaterThan(10);
  });

  it('keeps every target fully inside the field', () => {
    const sizes = [
      [800, 600],
      [360, 640],
    ] as const;
    const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];
    for (const difficulty of difficulties) {
      for (const [w, h] of sizes) {
        const field = make(777, DEFAULT_APPEARANCE, w, h, difficulty);
        for (let i = 0; i < 600; i++) {
          field.update(STEP_MS);
          for (const point of field.aimPoints()) {
            expect(point.x - point.r).toBeGreaterThanOrEqual(-0.01);
            expect(point.x + point.r).toBeLessThanOrEqual(w + 0.01);
            expect(point.y - point.r).toBeGreaterThanOrEqual(-0.01);
            expect(point.y + point.r).toBeLessThanOrEqual(h + 0.01);
          }
        }
      }
    }
  });

  it('moves targets smoothly, never teleporting a step', () => {
    const field = make(31415);
    let prev = first(field);
    for (let i = 0; i < 900; i++) {
      field.update(STEP_MS);
      const point = first(field);
      const jump = Math.hypot(point.x - prev.x, point.y - prev.y);
      // Max speed is 1.3 * SPEED of the field height per second.
      expect(jump).toBeLessThan(600 * 0.055 * 1.3 * (STEP_MS / 1000) * 1.05);
      prev = point;
    }
  });
});

describe('AttractField preview scale', () => {
  it('mirrors the difficulty target radius used by the run modes', () => {
    const easy = make(4242, DEFAULT_APPEARANCE, 800, 600, 'easy');
    const hard = make(4242, DEFAULT_APPEARANCE, 800, 600, 'hard');

    const easyRadius = first(easy).r;
    const hardRadius = first(hard).r;

    expect(easyRadius).toBeGreaterThan(hardRadius * 1.5);
    expect(easyRadius).toBeCloseTo(600 * TARGET_RADIUS.easy, 5);
    expect(hardRadius).toBeCloseTo(600 * TARGET_RADIUS.hard, 5);
  });

  it('scales the preview radius with the global target scale', () => {
    const look: Appearance = { ...DEFAULT_APPEARANCE, targetScale: 1.4 };
    const scaled = make(4242, look, 800, 600, 'normal');
    expect(first(scaled).r).toBeCloseTo(600 * TARGET_RADIUS.normal * 1.4, 5);
  });
});

describe('AttractField reduced motion', () => {
  it('freezes target paths', () => {
    const look: Appearance = { ...DEFAULT_APPEARANCE, reducedMotion: true };
    const field = make(2024, look);
    field.update(STEP_MS);
    const frozen = field.aimPoints();

    run(field, 600);
    expect(field.aimPoints()).toEqual(frozen);
  });
});

describe('AttractField taps', () => {
  it('pops a target on a hit and respawns it elsewhere', () => {
    const field = make(1337);
    const target = first(field);

    expect(field.tap(target.x, target.y)).toBe(true);
    expect(field.score).toBe(1);

    const moved = first(field);
    expect(Math.hypot(moved.x - target.x, moved.y - target.y)).toBeGreaterThan(0);
  });

  it('leaves the pop count alone on a miss', () => {
    const field = make(1337);
    expect(field.tap(1, 1)).toBe(false);
    expect(field.score).toBe(0);
  });

  it('aims and fires from the tap point with no prior pointer move', () => {
    const field = make(5150);
    // A tap alone must not throw: aim and tracer are internal, the pop proves the path.
    expect(field.tap(0, 0)).toBe(false);
    expect(field.score).toBe(0);
  });
});