// 계급, 시험, 등급, 점수, 날짜 — 서버(supabase/migrations/0001_init.sql)와 같은 규칙

export const RANKS: [string, number][] = [
  ['이병', 0], ['일병', 1000], ['상병', 3000], ['병장', 6000],
  ['하사', 10000], ['중사', 16000], ['상사', 24000], ['원사', 34000], ['준위', 46000],
  ['소위', 60000], ['중위', 78000], ['대위', 100000],
  ['소령', 130000], ['중령', 170000], ['대령', 220000],
  ['준장', 290000], ['소장', 380000], ['중장', 500000], ['대장', 650000],
];

export interface RankInfo { index: number; name: string; base: number; next: { name: string; xp: number } | null }

export function rankOf(xp: number): RankInfo {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1][1]) i++;
  const [name, base] = RANKS[i];
  const next = RANKS[i + 1];
  return { index: i, name, base, next: next ? { name: next[0], xp: next[1] } : null };
}
export const rankIndex = (name: string) => RANKS.findIndex(r => r[0] === name);

export interface Exam { id: number; name: string; need: string; desc: string; zone: string; reward: string; ready: boolean }
export const EXAMS: Exam[] = [
  { id: 1, name: '특등사수', need: '상병', desc: '측정사격 20발 중 18발 이상, 평균 사격 시간 4초 이내', zone: '상반신 전체', reward: '특등사수 휘장', ready: true },
  { id: 2, name: '저격수', need: '하사', desc: '300m 포함 10발 중 8발', zone: '가슴 원(지름 30cm)', reward: '장거리 표적 모드', ready: false },
  { id: 3, name: '정예 저격수', need: '상사', desc: '조준경 400m + 바람, 5발 중 4발', zone: '머리', reward: '바람 모드, 조준경 600m', ready: false },
  { id: 4, name: '마스터 저격수', need: '대위', desc: '조준경 600~800m 이동 표적, 5발 중 4발', zone: '머리', reward: '이동 표적 모드', ready: false },
  { id: 5, name: '전설의 저격수', need: '대령', desc: '800m 이동 표적 + 바람, 머리 5발 모두', zone: '머리', reward: '전용 칭호', ready: false },
];

export const DAILY_LIMIT = 3;
export const EXAM_LIMIT = 3;

export function grade(n: number): string {
  if (n >= 18) return '특등사수';
  if (n >= 15) return '1급';
  if (n >= 12) return '2급';
  if (n >= 10) return '3급';
  return '불합격';
}

/** 측정사격 경험치 — 서버 submit_run 과 같은 식. 서버가 붙으면 서버 값을 쓴다. */
export function rangeXP(o: { hits: number; byDist: Record<number, { hit: number }>; best: boolean; doubled: boolean }) {
  const hitXP = o.hits * 20 + (o.byDist[200]?.hit || 0) * 5 + (o.byDist[250]?.hit || 0) * 10;
  const g = grade(o.hits);
  const gb = g === '특등사수' ? 200 : g === '1급' ? 100 : g === '2급' ? 50 : 0;
  let xp = 100 + hitXP + gb;
  const lines: [string, number][] = [['한 판 완료', 100], [`명중 ${o.hits}발 (200·250m 보너스 포함)`, hitXP]];
  if (gb) lines.push([`${g} 보너스`, gb]);
  if (o.best) { xp += 100; lines.push(['개인 최고 기록', 100]); }
  if (o.doubled) { lines.push([`${xp} × 오늘 첫 판 2배`, xp * 2]); xp *= 2; }
  return { xp, lines };
}
export const streakXP = (n: number) => Math.min(300, n * 10);

/** 명중 1발 점수: 1000 + 300(1 - t/T) + 100(1 - r/R) */
export function shotScore(t: number, T: number, r: number, R: number): number {
  return 1000 + 300 * Math.max(0, 1 - t / T) + 100 * Math.max(0, 1 - r / R);
}

/** 한국 시간(KST) 날짜 키 20261115 — 기기 시간대와 상관없이 서버와 같은 날을 쓴다 */
export function kstDay(now = Date.now()): number {
  const d = new Date(now + 9 * 3600e3);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
/** 이번 주 월요일(KST) 키 */
export function kstWeek(now = Date.now()): number {
  const d = new Date(now + 9 * 3600e3);
  const dow = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  return m.getUTCFullYear() * 10000 + (m.getUTCMonth() + 1) * 100 + m.getUTCDate();
}

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function seededZero(seed: number) {
  const r = mulberry32(seed);
  const s = () => (r() < 0.5 ? -1 : 1);
  return { x: s() * (4 + Math.floor(r() * 6)), y: s() * (4 + Math.floor(r() * 6)) };
}

export const fmt = (n: number) => Number(n).toLocaleString('ko-KR');
