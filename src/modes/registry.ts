import { Rng } from '../engine/rng';
import type { ModeRuntime, RunConfig, World } from '../engine/types';
import { Gridshot } from './gridshot';

export function createMode(config: RunConfig, rng: Rng, world: World): ModeRuntime {
  switch (config.mode) {
    case 'gridshot':
      return new Gridshot(config, rng, world);
    default:
      throw new Error(`Mode not implemented yet: ${config.mode}`);
  }
}

export const IMPLEMENTED_MODES = ['gridshot'] as const;
