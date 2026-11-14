import { useState } from 'preact/hooks';
import type { TargetColorId, TargetShape, ThemeId } from '../engine/palette';
import { t, type StringKey } from '../i18n';
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

const THEMES: Array<[ThemeId, StringKey]> = [
  ['ink', 'theme.ink'],
  ['graphite', 'theme.graphite'],
  ['dusk', 'theme.dusk'],
];

const TARGET_COLORS: Array<[TargetColorId, StringKey]> = [
  ['frost', 'colour.frost'],
  ['sand', 'colour.sand'],
  ['mint', 'colour.mint'],
  ['violet', 'colour.violet'],
];

const TARGET_SHAPES: Array<[TargetShape, StringKey]> = [
  ['disc', 'shape.disc'],
  ['ring', 'shape.ring'],
  ['square', 'shape.square'],
];

const CROSSHAIR_SHAPES: Array<[CrosshairShape, StringKey]> = [
  ['cross', 'crosshair.cross'],
  ['dot', 'crosshair.dot'],
  ['circle', 'crosshair.circle'],
  ['t', 'crosshair.t'],
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
      setStatus(t('share.copied'));
    } catch {
      setStatus(t('share.copyBlocked'));
    }
  };

  const applyCode = (): void => {
    const parsed = decodeShareCode(importCode);
    if (!parsed) {
      setStatus(t('share.invalid'));
      return;
    }
    onChange(parsed);
    setStatus(t('share.imported'));
  };

  return (
    <section class="settings" aria-label={t('settings.title')} id="settings-panel">
      <fieldset class="settings-group">
        <legend>{t('settings.fieldTarget')}</legend>

        <label class="field-row" for="set-theme">
          <span>{t('settings.theme')}</span>
          <select
            id="set-theme"
            value={settings.theme}
            onChange={(event) => patch({ theme: event.currentTarget.value as ThemeId })}
          >
            {THEMES.map(([value, key]) => (
              <option key={value} value={value}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>

        <div class="field-row">
          <span id="set-color-label">{t('settings.targetColour')}</span>
          <div class="seg" role="group" aria-labelledby="set-color-label">
            {TARGET_COLORS.map(([value, key]) => (
              <button
                key={value}
                type="button"
                class={value === settings.targetColor ? 'seg-item is-on' : 'seg-item'}
                aria-pressed={value === settings.targetColor}
                onClick={() => patch({ targetColor: value })}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        <div class="field-row">
          <span id="set-shape-label">{t('settings.targetShape')}</span>
          <div class="seg" role="group" aria-labelledby="set-shape-label">
            {TARGET_SHAPES.map(([value, key]) => (
              <button
                key={value}
                type="button"
                class={value === settings.targetShape ? 'seg-item is-on' : 'seg-item'}
                aria-pressed={value === settings.targetShape}
                onClick={() => patch({ targetShape: value })}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        <label class="field-row" for="set-scale">
          <span>
            {t('settings.targetSize')} <output>{Math.round(settings.targetScale * 100)}%</output>
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
        <legend>{t('settings.crosshair')}</legend>

        <div
          class="crosshair-preview"
          role="img"
          aria-label={t('settings.crosshairPreview')}
          style={{
            cursor: crosshairCursor(settings.crosshair),
            backgroundImage: `${crosshairImage(settings.crosshair)}, radial-gradient(circle at 50% 50%, rgba(61, 214, 245, 0.1), transparent 62%)`,
          }}
        />

        <div class="field-row">
          <span id="set-xhair-label">{t('settings.crosshairShape')}</span>
          <div class="seg" role="group" aria-labelledby="set-xhair-label">
            {CROSSHAIR_SHAPES.map(([value, key]) => (
              <button
                key={value}
                type="button"
                class={value === settings.crosshair.shape ? 'seg-item is-on' : 'seg-item'}
                aria-pressed={value === settings.crosshair.shape}
                onClick={() => patchCrosshair({ shape: value })}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        <label class="field-row" for="set-xhair-size">
          <span>
            {t('settings.size')} <output>{settings.crosshair.size}px</output>
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
            {t('settings.thickness')} <output>{settings.crosshair.thickness}px</output>
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
            {t('settings.gap')} <output>{settings.crosshair.gap}px</output>
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
          <span>{t('settings.colour')}</span>
          <input
            id="set-xhair-color"
            type="color"
            value={settings.crosshair.color}
            onInput={(event) => patchCrosshair({ color: event.currentTarget.value })}
          />
        </label>

        <label class="field-row" for="set-xhair-opacity">
          <span>
            {t('settings.opacity')} <output>{Math.round(settings.crosshair.opacity * 100)}%</output>
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
          <span>{t('settings.outline')}</span>
        </label>
      </fieldset>

      <fieldset class="settings-group">
        <legend>{t('settings.inputAudio')}</legend>

        <label class="field-row" for="set-sensitivity">
          <span>
            {t('settings.sensitivity')} <output>{settings.sensitivity.toFixed(2)}×</output>
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
          <span>{t('settings.pointerLock')}</span>
        </label>

        <label class="field-row" for="set-volume">
          <span>
            {t('settings.volume')} <output>{Math.round(settings.volume * 100)}%</output>
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
          <span>{t('settings.mute')}</span>
        </label>

        <label class="check-row" for="set-motion">
          <input
            id="set-motion"
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) => patch({ reducedMotion: event.currentTarget.checked })}
          />
          <span>{t('settings.reduceMotion')}</span>
        </label>
      </fieldset>

      <fieldset class="settings-group settings-share">
        <legend>{t('settings.share')}</legend>
        <div class="share-row">
          <input
            type="text"
            readonly
            value={shareCode}
            placeholder={t('share.placeholder')}
            aria-label={t('share.codeLabel')}
          />
          <button type="button" class="ghost" onClick={() => setShareCode(encodeShareCode(settings))}>
            {t('share.generate')}
          </button>
          <button type="button" class="ghost" onClick={() => void copyCode()} disabled={!shareCode}>
            {t('share.copy')}
          </button>
        </div>
        <div class="share-row">
          <input
            type="text"
            value={importCode}
            placeholder="FL1..."
            aria-label={t('share.importLabel')}
            onInput={(event) => setImportCode(event.currentTarget.value)}
          />
          <button type="button" class="ghost" onClick={applyCode} disabled={!importCode.trim()}>
            {t('share.apply')}
          </button>
        </div>
        <p class="settings-status" role="status">
          {status ?? t('share.stored')}
        </p>
      </fieldset>
    </section>
  );
}
