import { render } from 'preact';
import type { AimPoint, Difficulty, ModeId, RunResult } from '../engine/types';
import { GameShell } from './GameShell';
import type { GameController, HudSnapshot, UiPhase } from './controller';

export interface FlicklabTestApi {
  start(opts?: { seed?: number; difficulty?: Difficulty; durationMs?: number }): void;
  advance(ms: number): void;
  tap(x: number, y: number, ts?: number): void;
  move(x: number, y: number): void;
  targets(): AimPoint[];
  size(): { w: number; h: number };
  hud(): HudSnapshot;
  result(): RunResult | null;
  phase(): UiPhase;
  gameState(): string | null;
}

declare global {
  interface Window {
    __fl?: FlicklabTestApi;
  }
}

export function mountGame(
  root: HTMLElement,
  mode: ModeId,
  exposeTestApi: boolean,
  autoStart = false,
): void {
  root.textContent = '';
  let controller: GameController | null = null;

  const handleReady = (instance: GameController): void => {
    controller = instance;
    if (exposeTestApi) window.__fl = buildTestApi(() => controller);
  };

  render(<GameShell mode={mode} onReady={handleReady} autoStart={autoStart} />, root);
}

function buildTestApi(get: () => GameController | null): FlicklabTestApi {
  return {
    start(opts) {
      const controller = get();
      if (!controller) return;
      if (opts?.difficulty) controller.setDifficulty(opts.difficulty);
      if (opts?.durationMs) controller.setDuration(opts.durationMs);
      controller.start(opts?.seed);
    },
    advance(ms) {
      get()?.advance(ms);
    },
    tap(x, y, ts) {
      get()?.tapAt(x, y, ts);
    },
    move(x, y) {
      get()?.moveTo(x, y);
    },
    targets() {
      return get()?.targets() ?? [];
    },
    size() {
      return get()?.canvasSize() ?? { w: 0, h: 0 };
    },
    hud() {
      return (
        get()?.lastHud ?? {
          score: 0,
          timeLeftMs: 0,
          accuracy: 0,
          hits: 0,
          attempts: 0,
          countdown: 0,
          progress: null,
        }
      );
    },
    result() {
      return get()?.lastResult ?? null;
    },
    phase() {
      return get()?.currentPhase ?? 'idle';
    },
    gameState() {
      return get()?.currentGame?.state ?? null;
    },
  };
}
