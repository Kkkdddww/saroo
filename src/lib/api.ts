// Supabase 연결. .env 에 키가 없으면 서버 없이(기기 저장만) 돌아간다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Mode, ShotLog } from '../game/engine';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const online = Boolean(url && key);
/** 서버가 응답하지 않으면 15초 뒤 실패로 끝낸다 (버튼이 계속 눌린 채로 멈추지 않게) */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  init?.signal?.addEventListener('abort', () => ctl.abort());
  return fetch(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
};

const sb: SupabaseClient | null = online
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      global: { fetch: fetchWithTimeout },
    })
  : null;

/** 켜 둔 소셜 로그인 (Supabase 에서 켠 것만). 예: VITE_AUTH_PROVIDERS=kakao,google. 비워 두면 게스트로만 시작한다 */
export type Provider = 'kakao' | 'google';
export const providers: Provider[] = ((import.meta.env.VITE_AUTH_PROVIDERS as string | undefined) || '')
  .split(',').map(s => s.trim()).filter((s): s is Provider => s === 'kakao' || s === 'google');

const MESSAGES: Record<string, string> = {
  daily_limit: '오늘의 사격은 하루 3번까지예요',
  exam_limit: '오늘 시험 기회를 다 썼어요',
  rank_too_low: '상병부터 도전할 수 있어요',
  already_passed: '이미 통과한 시험이에요',
  bad_nickname: '닉네임은 한글·영문·숫자 2~12자예요',
  nickname_taken: '이미 쓰는 닉네임이에요',
  run_expired: '30분이 지나 기록을 저장하지 못했어요',
  too_fast: '기록이 비정상이라 저장하지 않았어요',
  implausible_reaction: '기록이 비정상이라 저장하지 않았어요',
  implausible_shot: '기록이 비정상이라 저장하지 않았어요',
  too_many_shots: '기록이 비정상이라 저장하지 않았어요',
  streak_continues_after_miss: '기록이 비정상이라 저장하지 않았어요',
  run_already_submitted: '이미 저장된 판이에요',
  not_signed_in: '로그인이 풀렸어요. 다시 로그인해 주세요',
  guest_failed: '게스트로 시작하지 못했어요. 잠시 뒤 다시 해 주세요',
  anonymous_provider_disabled: '게스트 로그인이 꺼져 있어요 (Supabase에서 Anonymous sign-ins 켜기)',
  signup_disabled: '새 가입이 꺼져 있어요 (Supabase에서 Allow new users to sign up 켜기)',
  invalid_api_key: '서버 키가 맞지 않아요 (VITE_SUPABASE_ANON_KEY 확인)',
  timeout: '서버가 응답하지 않아요. 잠시 뒤 다시 해 주세요',
  network: '서버에 연결하지 못했어요 (인터넷 또는 VITE_SUPABASE_URL 확인)',
  oauth_failed: '로그인 창을 열지 못했어요',
  link_failed: '계정을 연결하지 못했어요',
  identity_taken: '그 계정은 이미 다른 기록에 연결돼 있어요',
};

export class ApiError extends Error {
  code: string;
  constructor(code: string) { super(MESSAGES[code] || '서버에 연결하지 못했어요'); this.code = code; }
}

/* ───────── 로그인 ───────── */
export type AuthKind = 'none' | 'guest' | 'member';
export interface AuthState { kind: AuthKind; userId: string | null; provider: string | null }

const NONE: AuthState = { kind: 'none', userId: null, provider: null };

function toState(user: { id: string; is_anonymous?: boolean; app_metadata?: { provider?: string; providers?: string[] } } | null | undefined): AuthState {
  if (!user) return NONE;
  if (user.is_anonymous) return { kind: 'guest', userId: user.id, provider: null };
  const prov = user.app_metadata?.providers?.find(p => p !== 'anonymous') ?? user.app_metadata?.provider ?? null;
  return { kind: 'member', userId: user.id, provider: prov };
}

export async function currentAuth(): Promise<AuthState> {
  if (!sb) return NONE;
  const { data } = await sb.auth.getSession();
  return toState(data.session?.user);
}

export function onAuthChange(cb: (s: AuthState) => void): () => void {
  if (!sb) return () => {};
  // 콜백 안에서 바로 Supabase 를 다시 부르면 로그인이 끝나지 않을 수 있어 다음 틱으로 미룬다 (Supabase 권장)
  const { data } = sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => cb(toState(session?.user)), 0); });
  return () => data.subscription.unsubscribe();
}

/** 돌아올 주소: GitHub Pages 하위 경로까지 그대로 */
const backUrl = () => location.origin + location.pathname;

/** 로그인 없이 시작 (익명 계정). 나중에 linkProvider 로 계정을 붙이면 계급이 그대로 이어진다. */
export async function signInGuest() {
  if (!sb) return;
  const r = await sb.auth.signInAnonymously();
  if (r.error) {
    const e = r.error as { code?: string; status?: number; name?: string; message?: string };
    console.error('signInAnonymously', e);
    const code = e.code && MESSAGES[e.code] ? e.code
      : /api key/i.test(e.message || '') ? 'invalid_api_key'
      : /abort/i.test(e.message || '') ? 'timeout'
      : e.name === 'AuthRetryableFetchError' || !e.status ? 'network'
      : 'guest_failed';
    throw new ApiError(code);
  }
}

/** 카카오·구글 로그인 (페이지가 그쪽으로 넘어갔다가 돌아온다) */
export async function signInWith(provider: Provider) {
  if (!sb) return;
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: backUrl() } });
  if (error) throw new ApiError('oauth_failed');
}

/** 게스트 계정에 카카오·구글을 연결한다. 같은 사용자 id 라 계급·기록이 그대로 남는다. */
export async function linkProvider(provider: Provider) {
  if (!sb) return;
  const { error } = await sb.auth.linkIdentity({ provider, options: { redirectTo: backUrl() } });
  if (error) throw new ApiError(/already|exists/i.test(error.message) ? 'identity_taken' : 'link_failed');
}

export async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
}

/** 세션이 있어야 서버 함수를 부를 수 있다 */
async function requireSession() {
  if (!sb) throw new ApiError('offline');
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new ApiError('not_signed_in');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  await requireSession();
  const { data, error } = await sb!.rpc(fn, args);
  if (error) {
    const code = (error.message || '').trim().split(/\s/)[0];
    throw new ApiError(code);
  }
  return data as T;
}

export interface ServerProfile { id: string; nickname: string; xp: number; exams: number; best_range: number; best_streak: number }
export interface StartRun { run_id: string; seed: number; attempt: number; period: string; limit: number | null }
export interface SubmitResult {
  hits: number; score: number; avg: number | null; xp_gained: number; xp_total: number;
  is_best: boolean; passed: boolean | null; attempt: number; attempts_left: number | null;
}
export interface Today { day: string; daily_used: number; daily_best: number | null; exam_used: number; week_streak: number | null }
export type Board = 'daily' | 'streak' | 'weekly' | 'xp';
export interface BoardRow {
  rank: number; total: number; user_id: string; nickname: string; xp: number; exams: number;
  hits: number | null; score: number | null; avg_time: number | null; streak: number | null; attempts: number | null; is_me: boolean;
}

export const api = {
  profile: () => rpc<ServerProfile>('ensure_profile'),
  setNickname: (name: string) => rpc<ServerProfile>('set_nickname', { p_name: name }),
  startRun: (mode: Mode) => rpc<StartRun>('start_run', { p_mode: mode }),
  submitRun: (runId: string, shots: ShotLog[]) => rpc<SubmitResult>('submit_run', { p_run: runId, p_shots: shots }),
  today: () => rpc<Today>('my_today'),
  leaderboard: (board: Board, limit = 50) => rpc<BoardRow[]>('leaderboard', { p_board: board, p_limit: limit }),
};
