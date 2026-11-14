import type { Appearance } from '../engine/appearance';
import type { Rng } from '../engine/rng';
import type { ModeId, ModeRuntime, RunConfig, World } from '../engine/types';
import { Cps } from './cps';
import { Flick } from './flick';
import { Gridshot } from './gridshot';
import { Precision } from './precision';
import { Reaction } from './reaction';
import { Tracking } from './tracking';

export interface ModeMeta {
  id: ModeId;
  label: string;
  blurb: string;
  /** Selectable durations in seconds. Empty means the mode is trial-based. */
  durations: readonly number[];
  defaultDuration: number;
  hasDifficulty: boolean;
}

export const MODE_META: Record<ModeId, ModeMeta> = {
  gridshot: {
    id: 'gridshot',
    label: 'Gridshot',
    blurb: 'Three targets on nine cells. Instant respawn.',
    durations: [15, 30, 60],
    defaultDuration: 60,
    hasDifficulty: true,
  },
  flick: {
    id: 'flick',
    label: 'Flick',
    blurb: 'One target at a time. Every hit moves it across the field.',
    durations: [15, 30, 60],
    defaultDuration: 30,
    hasDifficulty: true,
  },
  tracking: {
    id: 'tracking',
    label: 'Tracking',
    blurb: 'Hold the cursor on a target that never stops moving.',
    durations: [15, 30, 60],
    defaultDuration: 30,
    hasDifficulty: true,
  },
  precision: {
    id: 'precision',
    label: 'Precision',
    blurb: 'Small targets that shrink with every hit.',
    durations: [15, 30, 60],
    defaultDuration: 30,
    hasDifficulty: true,
  },
  reaction: {
    id: 'reaction',
    label: 'Reaction time',
    blurb: 'Five trials: wait for the disc, then click it.',
    durations: [],
    defaultDuration: 60,
    hasDifficulty: true,
  },
  cps: {
    id: 'cps',
    label: 'CPS test',
    blurb: 'Clicks per second inside a fixed pad.',
    durations: [1, 5, 10, 30, 60],
    defaultDuration: 10,
    hasDifficulty: true,
  },
};

export const MODE_IDS = Object.keys(MODE_META) as ModeId[];

export function createMode(
  config: RunConfig,
  rng: Rng,
  world: World,
  look: Appearance,
): ModeRuntime {
  switch (config.mode) {
    case 'gridshot':
      return new Gridshot(config, rng, world, look);
    case 'flick':
      return new Flick(config, rng, world, look);
    case 'tracking':
      return new Tracking(config, rng, world, look);
    case 'precision':
      return new Precision(config, rng, world, look);
    case 'reaction':
      return new Reaction(config, rng, world, look);
    case 'cps':
      return new Cps(config, world, look);
    default: {
      const exhaustive: never = config.mode;
      throw new Error(`Unknown mode: ${String(exhaustive)}`);
    }
  }
}

export const IMPLEMENTED_MODES = MODE_IDS;
