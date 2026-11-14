import type { Difficulty, ModeId, RunResult } from '../engine/types';

const KEY = 'flicklab.runs.v1';
const LIMIT = 200;

export interface BestInfo {
  isBest: boolean;
  previousBest: number | null;
}

function read(): RunResult[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRunResult);
  } catch {
    return [];
  }
}

function write(runs: readonly RunResult[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(-LIMIT)));
  } catch {
    // Storage may be full or blocked (private mode); runs stay in memory only.
  }
}

function isRunResult(value: unknown): value is RunResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['score'] === 'number' &&
    typeof r['mode'] === 'string' &&
    typeof r['difficulty'] === 'string' &&
    typeof r['finishedAt'] === 'number'
  );
}

export function loadRuns(): RunResult[] {
  return read();
}

export function saveRun(result: RunResult): BestInfo {
  const runs = read();
  const previousBest = bestOf(runs, result.mode, result.difficulty);
  runs.push(result);
  write(runs);
  return {
    isBest: previousBest === null ? result.score > 0 : result.score > previousBest,
    previousBest,
  };
}

export function bestOf(
  runs: readonly RunResult[],
  mode: ModeId,
  difficulty: Difficulty,
): number | null {
  let best: number | null = null;
  for (const run of runs) {
    if (run.mode !== mode || run.difficulty !== difficulty) continue;
    if (best === null || run.score > best) best = run.score;
  }
  return best;
}

export function personalBest(mode: ModeId, difficulty: Difficulty): number | null {
  return bestOf(read(), mode, difficulty);
}

export function historyFor(
  mode: ModeId,
  difficulty: Difficulty,
  limit = 20,
): RunResult[] {
  return read()
    .filter((r) => r.mode === mode && r.difficulty === difficulty)
    .slice(-limit);
}
