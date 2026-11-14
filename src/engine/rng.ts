const UINT32 = 4294967296;

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * xoshiro128** seeded through splitmix32.
 *
 * Deterministic and allocation-free: the same seed always yields the same
 * stream, and the whole state is four 32-bit words, so a run can be replayed
 * from a seed plus an ordered input log.
 */
export class Rng {
  private s0 = 1;
  private s1 = 2;
  private s2 = 3;
  private s3 = 4;

  constructor(seed = 1) {
    this.reseed(seed);
  }

  reseed(seed: number): void {
    let x = seed | 0;
    const next = (): number => {
      x = (x + 0x9e3779b9) | 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 0x9e3779b9;
  }

  nextUint32(): number {
    const s1 = this.s1;
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextUint32() / UINT32;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  snapshot(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  restore(state: readonly [number, number, number, number]): void {
    this.s0 = state[0];
    this.s1 = state[1];
    this.s2 = state[2];
    this.s3 = state[3];
  }
}
