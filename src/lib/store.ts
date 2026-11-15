// 기기 저장소. 서버가 없을 때는 이게 전부고, 서버가 있으면 영점·최근 기록 캐시로 쓴다.
import type { Mode } from '../game/engine';

export interface HistoryItem { t: number; mode: Mode; hits: number; score: number; avg: number }
export interface LocalProfile {
  uid: string | null;                       // 이 캐시가 누구 것인지 (계정이 바뀌면 비운다)
  xp: number;
  nickname: string | null;
  zero: { x: number; y: number } | null;   // 저장된 영점 오차 (클릭)
  zeroDay: number;
  bestRange: number;
  bestStreak: number;
  weekStreak: { week: number; best: number };
  daily: { day: number; used: number; best: number; submitted: number };
  exams: number;                            // 통과한 시험 단계
  examTries: { day: number; n: number };
  history: HistoryItem[];
}

const KEY = 'saro.profile.v2';
const fresh = (): LocalProfile => ({
  uid: null, xp: 0, nickname: null, zero: null, zeroDay: 0, bestRange: -1, bestStreak: 0,
  weekStreak: { week: 0, best: 0 }, daily: { day: 0, used: 0, best: -1, submitted: 0 },
  exams: 0, examTries: { day: 0, n: 0 }, history: [],
});

let cache: LocalProfile | null = null;

export function load(): LocalProfile {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
  } catch {
    cache = fresh();
  }
  return cache!;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 사생활 보호 모드 */ }
}
export function update(fn: (p: LocalProfile) => void): LocalProfile {
  const p = load();
  fn(p);
  save();
  cache = { ...p };
  return cache;
}
export function reset() { cache = fresh(); save(); }
