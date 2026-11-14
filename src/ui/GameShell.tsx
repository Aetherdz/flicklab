import { useEffect, useRef, useState } from 'preact/hooks';
import type { Difficulty, ModeId, RunResult } from '../engine/types';
import { MODE_META } from '../modes/registry';
import { loadSettings, saveSettings, type Settings } from '../settings/model';
import { personalBest } from '../stats/store';
import {
  GameController,
  type HudSnapshot,
  type ResultPayload,
  type UiPhase,
} from './controller';
import { ProgressChart } from './ProgressChart';
import { SettingsPanel } from './SettingsPanel';

const DIFF_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

const EMPTY_HUD: HudSnapshot = {
  score: 0,
  timeLeftMs: 0,
  accuracy: 0,
  hits: 0,
  attempts: 0,
  countdown: 0,
  progress: null,
};

export interface GameShellProps {
  mode: ModeId;
  onReady?: (controller: GameController) => void;
  autoStart?: boolean;
}

export function GameShell({ mode, onReady, autoStart = false }: GameShellProps) {
  const meta = MODE_META[mode];
  const initialDuration = meta.defaultDuration * 1000;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  const [phase, setPhase] = useState<UiPhase>('idle');
  const [hud, setHud] = useState<HudSnapshot>({ ...EMPTY_HUD, timeLeftMs: initialDuration });
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [durationMs, setDurationMs] = useState(initialDuration);
  const [best, setBest] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new GameController(canvas, {
      mode,
      difficulty: 'normal',
      durationMs: initialDuration,
      settings,
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
  }, [mode, onReady, autoStart, initialDuration]);

  useEffect(() => {
    controllerRef.current?.applySettings(settings);
  }, [settings]);

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
    // Scroll the whole panel, not just the canvas: on a phone the rail holds
    // the clock, and a run with no visible timer is unusable.
    shellRef.current?.scrollIntoView({ block: 'nearest' });
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

  const updateSettings = (next: Settings): void => {
    setSettings(next);
    saveSettings(next);
  };

  const primaryAction = (): void => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (phase === 'idle' || phase === 'finished') beginRun(controller);
    else if (phase === 'playing' || phase === 'paused') controller.togglePause();
  };

  const locked = isLocked(phase);
  const timeLabel = formatClock(phase === 'idle' ? durationMs : hud.timeLeftMs);
  const accuracyLabel = mode === 'tracking' ? 'On target' : 'Accuracy';
  const hitsLabel = mode === 'cps' ? 'Clicks' : mode === 'tracking' ? 'On time' : 'Hits';
  const hitsValue = mode === 'tracking' ? `${(hud.hits / 240).toFixed(1)}s` : String(hud.hits);

  return (
    <div class="shell" ref={shellRef}>
      <div class="rail">
        {meta.hasDifficulty && (
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
        )}

        {meta.durations.length > 0 && (
          <div class="rail-block">
            <span class="rail-label" id="duration-label">
              Duration
            </span>
            <div class="seg" role="group" aria-labelledby="duration-label">
              {meta.durations.map((seconds) => (
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
        )}

        <div class="rail-block">
          <span class="rail-label">Setup</span>
          <button
            type="button"
            class="ghost rail-settings"
            aria-expanded={panelOpen}
            aria-controls="settings-panel"
            onClick={() => setPanelOpen((open) => !open)}
          >
            {panelOpen ? 'Close settings' : 'Settings'}
          </button>
        </div>

        <dl class="hud">
          <div class="hud-cell">
            <dt>Score</dt>
            <dd>{hud.score}</dd>
          </div>
          <div class="hud-cell">
            <dt>{hud.progress?.label ?? 'Time'}</dt>
            <dd>{hud.progress?.value ?? timeLabel}</dd>
          </div>
          <div class="hud-cell">
            <dt>{accuracyLabel}</dt>
            <dd>{hud.attempts > 0 ? `${Math.round(hud.accuracy * 100)}%` : '--'}</dd>
          </div>
          <div class="hud-cell">
            <dt>{hitsLabel}</dt>
            <dd>{hitsValue}</dd>
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

      {panelOpen && <SettingsPanel settings={settings} onChange={updateSettings} />}

      <div class="field">
        <canvas ref={canvasRef} class="field-canvas" aria-label={`${meta.label} playfield`} />

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
                {resultRows(mode, payload.result).map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
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
                    setPanelOpen(true);
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
        <span>{meta.blurb}</span>
        <span class="keys-hint">
          <kbd>Enter</kbd> start · <kbd>R</kbd> restart · <kbd>Esc</kbd> pause
        </span>
      </div>

      <div class="analysis">
        <div class="analysis-head">
          <span>Personal best</span>
          <strong>{best ?? '--'}</strong>
        </div>
        <ProgressChart
          mode={mode}
          difficulty={difficulty}
          revision={payload?.result.finishedAt ?? 0}
        />
      </div>
    </div>
  );
}

function resultRows(mode: ModeId, result: RunResult): Array<{ label: string; value: string }> {
  switch (mode) {
    case 'tracking':
      return [
        {
          label: 'On target',
          value: `${Math.round((result.onTargetRatio ?? result.accuracy) * 100)}%`,
        },
        {
          label: 'Time on target',
          value: `${((result.onTargetRatio ?? 0) * (result.durationMs / 1000)).toFixed(1)} s`,
        },
        { label: 'Best unbroken hold', value: `${(result.bestStreak / 240).toFixed(2)} s` },
      ];
    case 'reaction':
      return [
        {
          label: 'Average reaction',
          value: result.avgTimeToTarget === null ? '--' : `${Math.round(result.avgTimeToTarget)} ms`,
        },
        { label: 'Valid trials', value: `${result.hits}` },
        { label: 'False starts', value: `${result.misses}` },
      ];
    case 'cps': {
      const seconds = result.durationMs / 1000;
      return [
        { label: 'Clicks', value: `${result.hits}` },
        { label: 'Clicks per second', value: (result.hits / seconds).toFixed(2) },
        { label: 'Accuracy', value: `${Math.round(result.accuracy * 100)}%` },
      ];
    }
    default:
      return [
        { label: 'Accuracy', value: `${Math.round(result.accuracy * 100)}%` },
        { label: 'Hits', value: `${result.hits}` },
        { label: 'Misses', value: `${result.misses}` },
        {
          label: 'Avg time to target',
          value:
            result.avgTimeToTarget === null ? '--' : `${Math.round(result.avgTimeToTarget)} ms`,
        },
        { label: 'Best streak', value: `${result.bestStreak}` },
        { label: 'Hits per second', value: result.hitsPerSec.toFixed(2) },
      ];
  }
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
