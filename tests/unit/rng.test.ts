import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine/rng';

describe('Rng', () => {
  it('produces the same stream for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const left = Array.from({ length: 64 }, () => a.nextUint32());
    const right = Array.from({ length: 64 }, () => b.nextUint32());
    expect(left).toEqual(right);
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const left = Array.from({ length: 32 }, () => a.nextUint32());
    const right = Array.from({ length: 32 }, () => b.nextUint32());
    expect(left).not.toEqual(right);
  });

  it('resumes exactly from a snapshot', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 10; i++) rng.nextUint32();
    const state = rng.snapshot();
    const expected = Array.from({ length: 16 }, () => rng.nextUint32());
    rng.restore(state);
    const replayed = Array.from({ length: 16 }, () => rng.nextUint32());
    expect(replayed).toEqual(expected);
  });

  it('stays inside [0, 1) and keeps a sane mean', () => {
    const rng = new Rng(7);
    let sum = 0;
    const samples = 20_000;
    for (let i = 0; i < samples; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      sum += value;
    }
    expect(sum / samples).toBeCloseTo(0.5, 2);
  });

  it('maps int() across the full range', () => {
    const rng = new Rng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) seen.add(rng.int(9));
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('never degenerates to a zero state', () => {
    const rng = new Rng(0);
    const values = new Set<number>();
    for (let i = 0; i < 200; i++) values.add(rng.nextUint32());
    expect(values.size).toBeGreaterThan(190);
  });
});
