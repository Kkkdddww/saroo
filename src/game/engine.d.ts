export type Mode = 'daily' | 'normal' | 'streak' | 'exam1';

export interface ShotLog { h: 0 | 1; d: number; t: number; T: number; r: number }
export interface Mark { u: number; v: number; hit: 0 | 1 }

export interface EngineConfig {
  mode: Mode;
  title: string;
  sub: string;
  seed: number | null;
  zeroErr: { x: number; y: number };
  needZero: boolean;
  onEnd: (res: EngineResult) => void;
  /** false 를 돌려주면 그만두기를 취소한다 */
  onQuit?: () => boolean | void;
}

export interface EngineResult {
  mode: Mode;
  hits: number;
  stats: Record<number, { shown: number; hit: number }>;
  avg: number;
  score: number;
  zero: { x: number; y: number };
  streak: number;
  shots: number[];
  marks: Mark[];
  log: ShotLog[];
  reason?: 'miss' | 'timeout';
  info?: { dx?: number; dy?: number; d?: number; held?: number; n?: number };
  stage?: number;
}

export interface Engine {
  start(cfg: EngineConfig): void;
  stop(): void;
  destroy(): void;
  ensureAudio(): void;
}

export function createEngine(root: HTMLElement): Engine;
