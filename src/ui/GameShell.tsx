import { useEffect, useRef, useState } from 'preact/hooks';
import type { Difficulty, ModeId, RunResult } from '../engine/types';
import { currentLocale, t, type StringKey } from '../i18n';
import { MODE_META } from '../modes/registry';
import { loadSettings, saveSettings, type Settings } from '../settings/model';
import { shareCardBlob } from '../share/card';
import { personalBest } from '../stats/store';
import {
  GameController,
  type HudSnapshot,
  type ResultPayload,
  type UiPhase,
} from './controller';
import { ProgressChart } from './ProgressChart';
import { SettingsPanel } from './SettingsPanel';

const DIFFICULTY_KEYS: Record<Difficulty, StringKey> = {
  easy: 'difficulty.easy',
  normal: 'difficulty.normal',
  hard: 'difficulty.hard',
};

const FULLSCREEN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false">
    <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

const EXIT_FULLSCREEN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false">
    <path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

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
  // A shared replay link carries the seed of the run it points at, so the same
  // link reproduces the same run on any device. Only the first run replays it;
  // later runs go back to fresh randomness.
  const replaySeed = useRef<number | null>(readSeed());

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
  const [fullscreen, setFullscreen] = useState(false);
  const [note, setNote] = useState('');
  /** Safari has no element fullscreen on iPhone, so the shell can also take
   *  the whole viewport through a fixed layout instead. */
  const [immersive, setImmersive] = useState(false);

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
    // Move focus to the result without scrolling the page: the replay button
    // lives in the rail above the field, so the view must stay where the run
    // just happened.
    if (phase === 'finished') resultsHeading.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    const onChange = (): void => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!immersive) return;
    document.documentElement.classList.add('is-immersive');
    return () => document.documentElement.classList.remove('is-immersive');
  }, [immersive]);

  const toggleFullscreen = (): void => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (immersive) {
      setImmersive(false);
      return;
    }
    if (typeof shell.requestFullscreen !== 'function') {
      setImmersive(true);
      return;
    }
    void shell.requestFullscreen({ navigationUI: 'hide' }).catch(() => setImmersive(true));
  };

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
        // The browser owns Escape while it is in fullscreen, so let it through
        // and do not turn the exit into a pause.
        if (document.fullscreenElement) return;
        if (immersive) {
          setImmersive(false);
          return;
        }
        event.preventDefault();
        controller.togglePause();
      } else if (event.key === 'f' || event.key === 'F') {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        toggleFullscreen();
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
  }, [immersive]);

  const beginRun = (controller: GameController): void => {
    setPayload(null);
    setNote('');
    // Scroll the whole panel, not just the canvas: on a phone the rail holds
    // the clock, and a run with no visible timer is unusable.
    shellRef.current?.scrollIntoView({ block: 'nearest' });
    const seed = replaySeed.current;
    replaySeed.current = null;
    controller.start(seed ?? undefined);
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

  const replayLink = (seed: number): string =>
    `${location.origin}${location.pathname}?seed=${seed}`;

  const copyReplayLink = async (): Promise<void> => {
    if (!payload) return;
    const link = replayLink(payload.result.seed);
    try {
      await navigator.clipboard.writeText(link);
      setNote(t('results.linkCopied'));
    } catch {
      setNote(t('results.copyBlocked'));
    }
  };

  const shareResult = async (): Promise<void> => {
    if (!payload) return;
    const result = payload.result;
    try {
      const blob = await shareCardBlob({
        modeId: mode,
        modeLabel: t(`mode.${mode}.label` as StringKey),
        score: result.score,
        accuracyPct: Math.round(result.accuracy * 100),
        difficultyLabel: t(DIFFICULTY_KEYS[difficulty]),
        seed: result.seed,
        isBest: payload.isBest,
        locale: currentLocale(),
        url: replayLink(result.seed),
      });
      const file = new File([blob], `flicklab-${mode}-${result.score}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'FlickLab' });
        return;
      }
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch {
      setNote(t('results.shareFailed'));
    }
  };

  const primaryAction = (): void => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (phase === 'idle' || phase === 'finished') beginRun(controller);
    else if (phase === 'playing' || phase === 'paused') controller.togglePause();
  };

  const locked = isLocked(phase);
  const timeLabel = formatClock(phase === 'idle' ? durationMs : hud.timeLeftMs);
  const accuracyLabel = t(mode === 'tracking' ? 'hud.onTarget' : 'hud.accuracy');
  const hitsLabel = t(
    mode === 'cps' ? 'hud.clicks' : mode === 'tracking' ? 'hud.onTime' : 'hud.hits',
  );
  const hitsValue = mode === 'tracking' ? `${(hud.hits / 240).toFixed(1)}s` : String(hud.hits);
  const progressLabel = hud.progress ? t(hud.progress.label as StringKey) : t('hud.time');

  return (
    <div class={immersive ? 'shell is-immersive' : 'shell'} ref={shellRef}>
      <div class="rail">
        {meta.hasDifficulty && (
          <div class="rail-block">
            <span class="rail-label" id="difficulty-label">
              {t('rail.difficulty')}
            </span>
            <div class="seg" role="group" aria-labelledby="difficulty-label">
              {(Object.keys(DIFFICULTY_KEYS) as Difficulty[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  class={key === difficulty ? 'seg-item is-on' : 'seg-item'}
                  aria-pressed={key === difficulty}
                  disabled={locked}
                  onClick={() => chooseDifficulty(key)}
                >
                  {t(DIFFICULTY_KEYS[key])}
                </button>
              ))}
            </div>
          </div>
        )}

        {meta.durations.length > 0 && (
          <div class="rail-block">
            <span class="rail-label" id="duration-label">
              {t('rail.duration')}
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
          <span class="rail-label">{t('rail.setup')}</span>
          <div class="rail-buttons">
            <button
              type="button"
              class="ghost rail-settings"
              aria-expanded={panelOpen}
              aria-controls="settings-panel"
              onClick={() => setPanelOpen((open) => !open)}
            >
              {t(panelOpen ? 'rail.closeSettings' : 'rail.settings')}
            </button>
            <button
              type="button"
              class="ghost rail-icon"
              data-fullscreen
              aria-pressed={fullscreen || immersive}
              aria-label={t(fullscreen || immersive ? 'rail.exitFullscreen' : 'rail.fullscreen')}
              title={t(fullscreen || immersive ? 'rail.exitFullscreen' : 'rail.fullscreen')}
              onClick={toggleFullscreen}
            >
              {fullscreen || immersive ? EXIT_FULLSCREEN_ICON : FULLSCREEN_ICON}
            </button>
          </div>
        </div>

        <dl class="hud">
          <div class="hud-cell">
            <dt>{t('hud.score')}</dt>
            <dd>{hud.score}</dd>
          </div>
          <div class="hud-cell">
            <dt>{progressLabel}</dt>
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

        <div class="rail-action">
          <button
            type="button"
            class="primary rail-button"
            data-action="primary"
            onClick={primaryAction}
            disabled={phase === 'countdown'}
          >
            {primaryLabel(phase)}
          </button>
        </div>
      </div>

      {panelOpen && <SettingsPanel settings={settings} onChange={updateSettings} />}

      <div class="field">
        <canvas
          ref={canvasRef}
          class="field-canvas"
          aria-label={`${t(`mode.${mode}.label` as StringKey)} ${t('field.playfield')}`}
        />

        {phase === 'countdown' && (
          <div class="overlay overlay-count" aria-live="assertive">
            <span class="count-number">{Math.max(1, hud.countdown)}</span>
          </div>
        )}

        {phase === 'paused' && (
          <div class="overlay overlay-count">
            <div class="overlay-body">
              <p class="overlay-kicker">{t('overlay.paused')}</p>
              <button type="button" class="primary" onClick={() => controllerRef.current?.togglePause()}>
                {t('action.resumeRun')}
              </button>
              <p class="overlay-hint keys-hint">
                <kbd>Esc</kbd> {t('hint.escToResume')} · <kbd>R</kbd> {t('hint.rToRestart')}
              </p>
            </div>
          </div>
        )}

        {phase === 'finished' && payload && (
          <div class="overlay overlay-results" aria-live="polite">
            <div class="results">
              <h2 class="results-title" tabIndex={-1} ref={resultsHeading}>
                {t(payload.isBest ? 'results.newBest' : 'results.complete')}
              </h2>
              <p class="results-score">
                {payload.result.score}
                <span>{t('results.score')}</span>
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
                {t('results.seed', { seed: payload.result.seed })}
              </p>
              <div class="results-actions">
                <button
                  type="button"
                  class="ghost"
                  data-action="share-card"
                  onClick={() => void shareResult()}
                >
                  {t('results.shareCard')}
                </button>
                <button
                  type="button"
                  class="ghost"
                  data-action="copy-link"
                  onClick={() => void copyReplayLink()}
                >
                  {t('results.copyLink')}
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
                  {t('action.changeSettings')}
                </button>
              </div>
              <p class="results-feedback" aria-live="polite">
                {note}
              </p>
            </div>
          </div>
        )}
      </div>

      <div class="field-foot">
        <span>{t(`mode.${mode}.blurb` as StringKey)}</span>
        <span class="keys-hint">
          <kbd>Enter</kbd> {t('keys.start')} · <kbd>R</kbd> {t('keys.restart')} · <kbd>Esc</kbd>{' '}
          {t('keys.pause')} · <kbd>F</kbd> {t('keys.fullscreen')}
        </span>
      </div>

      <div class="analysis">
        <div class="analysis-head">
          <span>{t('analysis.personalBest')}</span>
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
          label: t('row.onTarget'),
          value: `${Math.round((result.onTargetRatio ?? result.accuracy) * 100)}%`,
        },
        {
          label: t('row.timeOnTarget'),
          value: `${((result.onTargetRatio ?? 0) * (result.durationMs / 1000)).toFixed(1)} s`,
        },
        { label: t('row.bestHold'), value: `${(result.bestStreak / 240).toFixed(2)} s` },
      ];
    case 'reaction':
      return [
        {
          label: t('row.avgReaction'),
          value: result.avgTimeToTarget === null ? '--' : `${Math.round(result.avgTimeToTarget)} ms`,
        },
        { label: t('row.validTrials'), value: `${result.hits}` },
        { label: t('row.falseStarts'), value: `${result.misses}` },
      ];
    case 'cps': {
      const seconds = result.durationMs / 1000;
      return [
        { label: t('row.clicks'), value: `${result.hits}` },
        { label: t('row.cps'), value: (result.hits / seconds).toFixed(2) },
        { label: t('row.accuracy'), value: `${Math.round(result.accuracy * 100)}%` },
      ];
    }
    default:
      return [
        { label: t('row.accuracy'), value: `${Math.round(result.accuracy * 100)}%` },
        { label: t('row.hits'), value: `${result.hits}` },
        { label: t('row.misses'), value: `${result.misses}` },
        {
          label: t('row.avgTimeToTarget'),
          value:
            result.avgTimeToTarget === null ? '--' : `${Math.round(result.avgTimeToTarget)} ms`,
        },
        { label: t('row.bestStreak'), value: `${result.bestStreak}` },
        { label: t('row.hitsPerSecond'), value: result.hitsPerSec.toFixed(2) },
      ];
  }
}

function isLocked(phase: UiPhase): boolean {
  return phase === 'countdown' || phase === 'playing' || phase === 'paused';
}

function primaryLabel(phase: UiPhase): string {
  switch (phase) {
    case 'countdown':
      return t('action.starting');
    case 'playing':
      return t('action.pause');
    case 'paused':
      return t('action.resume');
    case 'finished':
      return t('action.playAgain');
    default:
      return t('action.start');
  }
}

function metaLine(payload: ResultPayload, best: number | null): string {
  if (!payload.isBest) return t('results.personalBest', { score: best ?? 0 });
  if (payload.previousBest === null) return t('results.firstRun');
  return t('results.previousBest', { score: payload.previousBest });
}

function readSeed(): number | null {
  const raw = new URLSearchParams(location.search).get('seed');
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= 0xffffffff ? value : null;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
