import { useMemo } from 'preact/hooks';
import type { Difficulty, ModeId } from '../engine/types';
import { t } from '../i18n';
import { historyFor } from '../stats/store';

interface Props {
  mode: ModeId;
  difficulty: Difficulty;
  /** Changes whenever a new run is stored, forcing a re-read. */
  revision: number;
}

const WIDTH = 260;
const HEIGHT = 56;
const PAD = 3;

export function ProgressChart({ mode, difficulty, revision }: Props) {
  const runs = useMemo(() => historyFor(mode, difficulty, 20), [mode, difficulty, revision]);
  const scores = runs.map((run) => run.score);

  const geometry = useMemo(() => {
    if (scores.length < 2) return null;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const span = max - min || 1;
    const step = (WIDTH - PAD * 2) / (scores.length - 1);
    const points = scores.map((score, index) => {
      const x = PAD + index * step;
      const y = HEIGHT - PAD - ((score - min) / span) * (HEIGHT - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { points: points.join(' '), min, max };
  }, [scores.join(',')]);

  const best = scores.length > 0 ? Math.max(...scores) : null;
  const latest = scores.length > 0 ? (scores[scores.length - 1] as number) : null;

  return (
    <div class="chart">
      <div class="chart-head">
        <span class="chart-label">{t('chart.label', { count: scores.length || 0 })}</span>
        <span class="chart-values">
          {best !== null && <>{t('chart.best', { score: best })}</>}
          {latest !== null && <> · {t('chart.last', { score: latest })}</>}
        </span>
      </div>
      {geometry ? (
        <svg
          class="chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={t('chart.aria', { count: scores.length, best: best ?? 0 })}
        >
          <polyline points={geometry.points} fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
      ) : (
        <p class="chart-empty">{t('chart.empty')}</p>
      )}
    </div>
  );
}
