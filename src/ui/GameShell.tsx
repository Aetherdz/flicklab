import { useEffect, useRef, useState } from 'preact/hooks';
import type { Difficulty, ModeId } from '../engine/types';
import { personalBest } from '../stats/store';
import {
  GameController,
  type HudSnapshot,
  type ResultPayload,
  type UiPhase,
} from './controller';

const DIFF_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

const DURATION_OPTIONS = [15, 30, 60] as const;

const EMPTY_HUD: HudSnapshot = {
  score: 0,
  timeLeftMs: 60_000,
  accuracy: 0,
  hits: 0,
  attempts: 0,
  countdown: 0,
};

export interface GameShellProps {
  mode: ModeId;
  onReady?: (controller: GameController) => void;
  autoStart?: boolean;
}

export function GameShell({ mode, onReady, autoStart = false }: GameShellProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  const [phase, setPhase] = useState<UiPhase>('idle');
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [durationMs, setDurationMs] = useState(60_000);
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new GameController(canvas, {
      mode,
      difficulty: 'normal',
      durationMs: 60_000,
      callbacks: {
        onPhase: setPhase,
        onHud: setHud,
        onResult: (next) => setPayload(next),
      },
    });
    controllerRef.current = controller;
    onReady?.(controller);
    if (autoStart) controller.start();
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [mode, onReady, autoStart]);

  useEffect(() => {
    setBest(personalBest(mode, difficulty));
  }, [mode, difficulty, payload]);

  useEffect(() => {
    if (phase === 'finished') resultsHeading.current?.focus();
  }, [phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const controller = controllerRef.current;
      if (!controller) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;

      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        beginRun(controller);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        controller.togglePause();
      } else if (event.key === 'Enter') {
        if (controller.currentPhase === 'idle') {
          event.preventDefault();
          beginRun(controller);
        } else if (controller.currentPhase === 'paused') {
          event.preventDefault();
          controller.togglePause();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const beginRun = (controller: GameController): void => {
    setPayload(null);
    stageRef.current?.scrollIntoView({ block: 'nearest' });
    controller.start();
  };

  const chooseDifficulty = (next: Difficulty): void => {
    if (isLocked(phase)) return;
    setDifficulty(next);
    controllerRef.current?.setDifficulty(next);
  };

  const chooseDuration = (seconds: number): void => {
    if (isLocked(phase)) return;
    setDurationMs(seconds * 1000);
    controllerRef.current?.setDuration(seconds * 1000);
  };

  const primaryAction = (): void => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (phase === 'idle' || phase === 'finished') beginRun(controller);
    else if (phase === 'playing' || phase === 'paused') controller.togglePause();
  };

  const locked = isLocked(phase);
  const timeLabel = formatClock(phase === 'idle' ? durationMs : hud.timeLeftMs);

  return (
    <div class="shell">
      <div class="rail">
        <div class="rail-block">
          <span class="rail-label" id="difficulty-label">
            Difficulty
          </span>
          <div class="seg" role="group" aria-labelledby="difficulty-label">
            {(Object.keys(DIFF_LABELS) as Difficulty[]).map((key) => (
              <button
                key={key}
                type="button"
                class={key === difficulty ? 'seg-item is-on' : 'seg-item'}
                aria-pressed={key === difficulty}
                disabled={locked}
                onClick={() => chooseDifficulty(key)}
              >
                {DIFF_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div class="rail-block">
          <span class="rail-label" id="duration-label">
            Duration
          </span>
          <div class="seg" role="group" aria-labelledby="duration-label">
            {DURATION_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                class={seconds * 1000 === durationMs ? 'seg-item is-on' : 'seg-item'}
                aria-pressed={seconds * 1000 === durationMs}
                disabled={locked}
                onClick={() => chooseDuration(seconds)}
              >
                {seconds}s
              </button>
            ))}
          </div>
        </div>

        <dl class="hud">
          <div class="hud-cell">
            <dt>Score</dt>
            <dd>{hud.score}</dd>
          </div>
          <div class="hud-cell">
            <dt>Time</dt>
            <dd>{timeLabel}</dd>
          </div>
          <div class="hud-cell">
            <dt>Accuracy</dt>
            <dd>{hud.attempts > 0 ? `${Math.round(hud.accuracy * 100)}%` : '--'}</dd>
          </div>
          <div class="hud-cell">
            <dt>Hits</dt>
            <dd>{hud.hits}</dd>
          </div>
        </dl>

        <div class={phase === 'finished' ? 'rail-action is-hidden' : 'rail-action'}>
          <button
            type="button"
            class="primary rail-button"
            onClick={primaryAction}
            disabled={phase === 'countdown'}
          >
            {primaryLabel(phase)}
          </button>
        </div>
      </div>

      <div class="field" ref={stageRef}>
        <canvas ref={canvasRef} class="field-canvas" aria-label="Gridshot playfield" />

        {phase === 'countdown' && (
          <div class="overlay overlay-count" aria-live="assertive">
            <span class="count-number">{Math.max(1, hud.countdown)}</span>
          </div>
        )}

        {phase === 'paused' && (
          <div class="overlay overlay-count">
            <div class="overlay-body">
              <p class="overlay-kicker">Paused</p>
              <button type="button" class="primary" onClick={() => controllerRef.current?.togglePause()}>
                Resume run
              </button>
              <p class="overlay-hint keys-hint">
                <kbd>Esc</kbd> to resume · <kbd>R</kbd> to restart
              </p>
            </div>
          </div>
        )}

        {phase === 'finished' && payload && (
          <div class="overlay overlay-results" aria-live="polite">
            <div class="results">
              <h2 class="results-title" tabIndex={-1} ref={resultsHeading}>
                {payload.isBest ? 'New personal best' : 'Run complete'}
              </h2>
              <p class="results-score">
                {payload.result.score}
                <span>score</span>
              </p>
              <dl class="results-grid">
                <div>
                  <dt>Accuracy</dt>
                  <dd>{Math.round(payload.result.accuracy * 100)}%</dd>
                </div>
                <div>
                  <dt>Hits</dt>
                  <dd>{payload.result.hits}</dd>
                </div>
                <div>
                  <dt>Misses</dt>
                  <dd>{payload.result.misses}</dd>
                </div>
                <div>
                  <dt>Avg time to target</dt>
                  <dd>
                    {payload.result.avgTimeToTarget === null
                      ? '--'
                      : `${Math.round(payload.result.avgTimeToTarget)} ms`}
                  </dd>
                </div>
                <div>
                  <dt>Best streak</dt>
                  <dd>{payload.result.bestStreak}</dd>
                </div>
                <div>
                  <dt>Hits per second</dt>
                  <dd>{payload.result.hitsPerSec.toFixed(2)}</dd>
                </div>
              </dl>
              <p class="results-meta">
                {metaLine(payload, best)}
                {' · '}
                Seed {payload.result.seed}
              </p>
              <div class="results-actions">
                <button type="button" class="primary" onClick={() => beginRun(controllerRef.current!)}>
                  Play again
                </button>
                <button
                  type="button"
                  class="ghost"
                  onClick={() => {
                    setPayload(null);
                    controllerRef.current?.reset();
                  }}
                >
                  Change settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div class="field-foot">
        <span>3 live targets · instant respawn</span>
        <span class="keys-hint">
          <kbd>Enter</kbd> start · <kbd>R</kbd> restart · <kbd>Esc</kbd> pause
        </span>
      </div>
    </div>
  );
}

function isLocked(phase: UiPhase): boolean {
  return phase === 'countdown' || phase === 'playing' || phase === 'paused';
}

function primaryLabel(phase: UiPhase): string {
  switch (phase) {
    case 'countdown':
      return 'Starting';
    case 'playing':
      return 'Pause';
    case 'paused':
      return 'Resume';
    case 'finished':
      return 'Play again';
    default:
      return 'Start run';
  }
}

function metaLine(payload: ResultPayload, best: number | null): string {
  if (!payload.isBest) return `Personal best ${best ?? 0}`;
  if (payload.previousBest === null) return 'First scored run';
  return `Previous best ${payload.previousBest}`;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
