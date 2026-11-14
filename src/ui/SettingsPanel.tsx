import { useState } from 'preact/hooks';
import type { TargetColorId, TargetShape, ThemeId } from '../engine/palette';
import {
  crosshairCursor,
  crosshairImage,
  decodeShareCode,
  encodeShareCode,
  type CrosshairShape,
  type Settings,
} from '../settings/model';

interface Props {
  settings: Settings;
  onChange: (next: Settings) => void;
}

const THEME_LABELS: Array<[ThemeId, string]> = [
  ['ink', 'Ink'],
  ['graphite', 'Graphite'],
  ['dusk', 'Dusk'],
];

const TARGET_COLORS: Array<[TargetColorId, string]> = [
  ['frost', 'Frost'],
  ['sand', 'Sand'],
  ['mint', 'Mint'],
  ['violet', 'Violet'],
];

const TARGET_SHAPES: Array<[TargetShape, string]> = [
  ['disc', 'Disc'],
  ['ring', 'Ring'],
  ['square', 'Square'],
];

const CROSSHAIR_SHAPES: Array<[CrosshairShape, string]> = [
  ['cross', 'Cross'],
  ['dot', 'Dot'],
  ['circle', 'Circle'],
  ['t', 'T'],
];

export function SettingsPanel({ settings, onChange }: Props) {
  const [shareCode, setShareCode] = useState('');
  const [importCode, setImportCode] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const patch = (partial: Partial<Settings>): void => {
    onChange({ ...settings, ...partial });
  };
  const patchCrosshair = (partial: Partial<Settings['crosshair']>): void => {
    onChange({ ...settings, crosshair: { ...settings.crosshair, ...partial } });
  };

  const copyCode = async (): Promise<void> => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      setStatus('Share code copied.');
    } catch {
      setStatus('Copy blocked — select the code and copy it manually.');
    }
  };

  const applyCode = (): void => {
    const parsed = decodeShareCode(importCode);
    if (!parsed) {
      setStatus('That code is not a valid FlickLab settings code.');
      return;
    }
    onChange(parsed);
    setStatus('Settings imported.');
  };

  return (
    <section class="settings" aria-label="Settings" id="settings-panel">
      <fieldset class="settings-group">
        <legend>Field and target</legend>

        <label class="field-row" for="set-theme">
          <span>Theme</span>
          <select
            id="set-theme"
            value={settings.theme}
            onChange={(event) => patch({ theme: event.currentTarget.value as ThemeId })}
          >
            {THEME_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div class="field-row">
          <span id="set-color-label">Target colour</span>
          <div class="seg" role="group" aria-labelledby="set-color-label">
            {TARGET_COLORS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                class={value === settings.targetColor ? 'seg-item is-on' : 'seg-item'}
                aria-pressed={value === settings.targetColor}
                onClick={() => patch({ targetColor: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div class="field-row">
          <span id="set-shape-label">Target shape</span>
          <div class="seg" role="group" aria-labelledby="set-shape-label">
            {TARGET_SHAPES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                class={value === settings.targetShape ? 'seg-item is-on' : 'seg-item'}
                aria-pressed={value === settings.targetShape}
                onClick={() => patch({ targetShape: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label class="field-row" for="set-scale">
          <span>
            Target size <output>{Math.round(settings.targetScale * 100)}%</output>
          </span>
          <input
            id="set-scale"
            type="range"
            min="0.7"
            max="1.4"
            step="0.05"
            value={settings.targetScale}
            onInput={(event) => patch({ targetScale: Number(event.currentTarget.value) })}
          />
        </label>
      </fieldset>

      <fieldset class="settings-group">
        <legend>Crosshair</legend>

        <div
          class="crosshair-preview"
          role="img"
          aria-label="Crosshair preview"
          style={{
            cursor: crosshairCursor(settings.crosshair),
            backgroundImage: `${crosshairImage(settings.crosshair)}, radial-gradient(circle at 50% 50%, rgba(61, 214, 245, 0.1), transparent 62%)`,
          }}
        />

        <div class="field-row">
          <span id="set-xhair-label">Shape</span>
          <div class="seg" role="group" aria-labelledby="set-xhair-label">
            {CROSSHAIR_SHAPES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                class={value === settings.crosshair.shape ? 'seg-item is-on' : 'seg-item'}
                aria-pressed={value === settings.crosshair.shape}
                onClick={() => patchCrosshair({ shape: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label class="field-row" for="set-xhair-size">
          <span>
            Size <output>{settings.crosshair.size}px</output>
          </span>
          <input
            id="set-xhair-size"
            type="range"
            min="2"
            max="40"
            step="1"
            value={settings.crosshair.size}
            onInput={(event) => patchCrosshair({ size: Number(event.currentTarget.value) })}
          />
        </label>

        <label class="field-row" for="set-xhair-thickness">
          <span>
            Thickness <output>{settings.crosshair.thickness}px</output>
          </span>
          <input
            id="set-xhair-thickness"
            type="range"
            min="1"
            max="10"
            step="1"
            value={settings.crosshair.thickness}
            onInput={(event) => patchCrosshair({ thickness: Number(event.currentTarget.value) })}
          />
        </label>

        <label class="field-row" for="set-xhair-gap">
          <span>
            Gap <output>{settings.crosshair.gap}px</output>
          </span>
          <input
            id="set-xhair-gap"
            type="range"
            min="0"
            max="24"
            step="1"
            value={settings.crosshair.gap}
            onInput={(event) => patchCrosshair({ gap: Number(event.currentTarget.value) })}
          />
        </label>

        <label class="field-row" for="set-xhair-color">
          <span>Colour</span>
          <input
            id="set-xhair-color"
            type="color"
            value={settings.crosshair.color}
            onInput={(event) => patchCrosshair({ color: event.currentTarget.value })}
          />
        </label>

        <label class="field-row" for="set-xhair-opacity">
          <span>
            Opacity <output>{Math.round(settings.crosshair.opacity * 100)}%</output>
          </span>
          <input
            id="set-xhair-opacity"
            type="range"
            min="0.15"
            max="1"
            step="0.05"
            value={settings.crosshair.opacity}
            onInput={(event) => patchCrosshair({ opacity: Number(event.currentTarget.value) })}
          />
        </label>

        <label class="check-row" for="set-xhair-outline">
          <input
            id="set-xhair-outline"
            type="checkbox"
            checked={settings.crosshair.outline}
            onChange={(event) => patchCrosshair({ outline: event.currentTarget.checked })}
          />
          <span>Dark outline for bright fields</span>
        </label>
      </fieldset>

      <fieldset class="settings-group">
        <legend>Input and audio</legend>

        <label class="field-row" for="set-sensitivity">
          <span>
            Sensitivity <output>{settings.sensitivity.toFixed(2)}×</output>
          </span>
          <input
            id="set-sensitivity"
            type="range"
            min="0.2"
            max="3"
            step="0.05"
            value={settings.sensitivity}
            onInput={(event) => patch({ sensitivity: Number(event.currentTarget.value) })}
          />
        </label>

        <label class="check-row" for="set-lock">
          <input
            id="set-lock"
            type="checkbox"
            checked={settings.pointerLock}
            onChange={(event) => patch({ pointerLock: event.currentTarget.checked })}
          />
          <span>Pointer lock (raw mouse movement, Esc to release)</span>
        </label>

        <label class="field-row" for="set-volume">
          <span>
            Volume <output>{Math.round(settings.volume * 100)}%</output>
          </span>
          <input
            id="set-volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.volume}
            onInput={(event) => patch({ volume: Number(event.currentTarget.value) })}
          />
        </label>

        <label class="check-row" for="set-muted">
          <input
            id="set-muted"
            type="checkbox"
            checked={settings.muted}
            onChange={(event) => patch({ muted: event.currentTarget.checked })}
          />
          <span>Mute sound effects</span>
        </label>

        <label class="check-row" for="set-motion">
          <input
            id="set-motion"
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) => patch({ reducedMotion: event.currentTarget.checked })}
          />
          <span>Reduce motion (no particles or trails)</span>
        </label>
      </fieldset>

      <fieldset class="settings-group settings-share">
        <legend>Share settings</legend>
        <div class="share-row">
          <input
            type="text"
            readonly
            value={shareCode}
            placeholder="Generate a code to copy your setup"
            aria-label="Share code"
          />
          <button type="button" class="ghost" onClick={() => setShareCode(encodeShareCode(settings))}>
            Generate
          </button>
          <button type="button" class="ghost" onClick={() => void copyCode()} disabled={!shareCode}>
            Copy
          </button>
        </div>
        <div class="share-row">
          <input
            type="text"
            value={importCode}
            placeholder="FL1..."
            aria-label="Import share code"
            onInput={(event) => setImportCode(event.currentTarget.value)}
          />
          <button type="button" class="ghost" onClick={applyCode} disabled={!importCode.trim()}>
            Apply code
          </button>
        </div>
        <p class="settings-status" role="status">
          {status ?? 'Settings are stored in this browser only.'}
        </p>
      </fieldset>
    </section>
  );
}
