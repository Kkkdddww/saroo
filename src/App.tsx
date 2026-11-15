import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineConfig, EngineResult, Mode } from './game/engine';
import { api, ApiError, linkProvider, onAuthChange, online, providers, signInGuest, signInWith, signOut, type AuthState, type Provider } from './lib/api';
import { DAILY_LIMIT, EXAMS, EXAM_LIMIT, fmt, kstDay, kstWeek, rangeXP, rankOf, seededZero, streakXP } from './lib/data';
import * as store from './lib/store';
import { Ins, type Screen } from './components/ui';
import Home from './screens/Home';
import Ranking from './screens/Ranking';
import Exam from './screens/Exam';
import Records from './screens/Records';
import GameScreen from './screens/GameScreen';
import Result, { type ResultData } from './screens/Result';
import Onboarding, { type OnboardStep } from './screens/Onboarding';

const ONBOARDED = 'saro.onboarded';
const AFTER_LOGIN = 'saro.afterLogin';
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* */ } } };

export type Kind = Mode;

interface Playing { cfg: EngineConfig; kind: Kind; runId: string | null; attempt: number; opts: { rezero?: boolean } }

/** 날짜가 바뀌었으면 하루·주 단위 카운터를 비운다 (KST) */
function rollDay(p: store.LocalProfile) {
  const d = kstDay(), w = kstWeek();
  if (p.daily.day !== d) p.daily = { day: d, used: 0, best: -1, submitted: 0 };
  if (p.examTries.day !== d) p.examTries = { day: d, n: 0 };
  if (p.weekStreak.week !== w) p.weekStreak = { week: w, best: 0 };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [p, setP] = useState<store.LocalProfile>(() => store.update(rollDay));
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [promo, setPromo] = useState<{ rank: string; desc: string } | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [focusName, setFocusName] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);       // null = 확인 중
  const [ob, setOb] = useState<OnboardStep | null>(null);         // 온보딩 단계 (null = 안 보임)
  const [busy, setBusy] = useState(false);
  const authRef = useRef<AuthState | null>(null);
  const signedIn = () => !!authRef.current && authRef.current.kind !== 'none';

  const toast = useCallback((t: string) => {
    setToastMsg(t);
    window.clearTimeout((toast as unknown as { t?: number }).t);
    (toast as unknown as { t?: number }).t = window.setTimeout(() => setToastMsg(''), 2000);
  }, []);
  const patch = (fn: (q: store.LocalProfile) => void) => setP(store.update(q => { rollDay(q); fn(q); }));

  /** 서버 값으로 기기 캐시를 맞춘다 */
  const sync = useCallback(async () => {
    if (!online || !signedIn()) return null;
    try {
      const [prof, today] = await Promise.all([api.profile(), api.today()]);
      setP(store.update(q => {
        rollDay(q);
        q.xp = prof.xp; q.nickname = prof.nickname; q.exams = prof.exams;
        q.bestRange = prof.best_range; q.bestStreak = prof.best_streak;
        q.daily.used = today.daily_used; q.daily.best = today.daily_best ?? -1;
        q.examTries.n = today.exam_used;
        q.weekStreak.best = today.week_streak ?? 0;
      }));
      return prof;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '서버에 연결하지 못했어요');
      return null;
    }
  }, [toast]);

  /* ---------- 로그인 · 온보딩 ---------- */
  const finishOnboarding = useCallback(() => { ls.set(ONBOARDED, '1'); setOb(null); setScreen('home'); }, []);

  useEffect(() => {
    // 카카오·구글에서 돌아왔는데 실패한 경우
    const q = new URLSearchParams(location.search);
    if (q.get('error') || q.get('error_description')) {
      toast('로그인하지 못했어요. 다시 시도해 주세요');
      history.replaceState(null, '', location.pathname);
    }
    if (!online) {
      authRef.current = { kind: 'guest', userId: 'local', provider: null };
      setAuth(authRef.current);
      if (!ls.get(ONBOARDED)) setOb('intro');
      return;
    }
    return onAuthChange(async a => {
      const prevKind = authRef.current?.kind;
      authRef.current = a; setAuth(a);
      if (a.kind === 'none') { setOb(ls.get(ONBOARDED) ? 'login' : 'intro'); return; }
      // 다른 계정으로 바뀌었으면 기기 캐시를 비운다
      const cached = store.load().uid;
      if (cached && cached !== a.userId) store.reset();
      setP(store.update(q2 => { rollDay(q2); q2.uid = a.userId; }));
      const prof = await sync();
      if (ls.get(AFTER_LOGIN) || prevKind === 'none') {
        ls.set(AFTER_LOGIN, null);
        if (prof && prof.nickname.startsWith('사수')) setOb('nickname'); else finishOnboarding();
      } else setOb(o => (o === 'nickname' ? o : null));
    });
  }, [sync, toast, finishOnboarding]);

  async function loginWith(pv: Provider) {
    setBusy(true);
    ls.set(AFTER_LOGIN, '1');
    try { await signInWith(pv); } catch (e) { toast((e as Error).message); setBusy(false); }
  }
  async function loginGuest() {
    setBusy(true);
    ls.set(AFTER_LOGIN, '1');
    try { await signInGuest(); } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  async function link(pv: Provider) {
    try { await linkProvider(pv); }
    catch (e) {
      if (e instanceof ApiError && e.code === 'identity_taken') {
        if (confirm('그 계정에는 이미 기록이 있어요. 그 계정으로 로그인할까요? 지금 게스트 기록은 사라져요.')) {
          await signOut(); store.reset(); await loginWith(pv);
        }
      } else toast((e as Error).message);
    }
  }
  async function logout() {
    if (!confirm('로그아웃할까요? 다시 로그인하면 기록이 그대로 있어요.')) return;
    await signOut(); store.reset(); setP(store.update(rollDay));
  }

  const go = (s: Screen) => {
    if (s === 'home' || s === 'ranking' || s === 'records') sync();
    setFocusName(false);
    setScreen(s);
  };

  /* ---------- 시작 ---------- */
  async function play(kind: Kind, opts: { rezero?: boolean } = {}) {
    const q = store.update(rollDay);
    if (!online) {
      if (kind === 'daily' && q.daily.used >= DAILY_LIMIT) return toast('오늘의 사격은 하루 3번까지예요');
      if (kind === 'exam1' && q.examTries.n >= EXAM_LIMIT) return toast('오늘 시험 기회를 다 썼어요');
    }
    let runId: string | null = null, seed: number | null = null, attempt = 1;
    if (online) {
      try {
        const s = await api.startRun(kind);
        runId = s.run_id; seed = Number(s.seed); attempt = s.attempt;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : '서버에 연결하지 못했어요');
        if (e instanceof ApiError && ['daily_limit', 'exam_limit', 'rank_too_low', 'already_passed'].includes(e.code)) { sync(); return; }
        // 서버가 안 되면 기록 없이 연습으로만 쏜다
        if (kind === 'daily' || kind === 'exam1') return;
      }
    }
    const today = kstDay();
    if (seed == null) {
      seed = kind === 'daily' ? today : kind === 'streak' ? kstWeek() + 77 : kind === 'exam1' ? today * 7 + 11 + q.examTries.n : Math.floor(Math.random() * 1e9);
      if (kind === 'daily') attempt = q.daily.used + 1;
    }
    // 시작한 순간 1회로 센다 (서버와 같은 규칙)
    patch(x => { if (kind === 'daily') x.daily.used = Math.max(x.daily.used, attempt); if (kind === 'exam1') x.examTries.n++; });

    let cfg: Omit<EngineConfig, 'onEnd' | 'onQuit'>;
    if (kind === 'daily') {
      cfg = { mode: 'daily', title: '측정사격', sub: `오늘의 사격 · ${attempt}/${DAILY_LIMIT}번째`, seed, zeroErr: seededZero(seed * 3 + 1), needZero: true };
    } else if (kind === 'normal') {
      let z = q.zero; const need = !z || !!opts.rezero;
      if (need || !z) z = seededZero(Math.floor(Math.random() * 1e9));
      else if (q.zeroDay !== today) {
        const j = () => (Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? -1 : 1);
        z = { x: z.x + j(), y: z.y + j() };   // 하루가 지나면 1클릭쯤 틀어진다
      }
      cfg = { mode: 'normal', title: '측정사격', sub: '일반 사격', seed, zeroErr: z, needZero: need };
    } else if (kind === 'streak') {
      cfg = { mode: 'streak', title: '연속사격', sub: '이번 주 시드 · 빗나가면 끝', seed, zeroErr: q.zero || seededZero(seed), needZero: !q.zero };
    } else {
      cfg = { mode: 'exam1', title: '특등사수 자격시험', sub: '18발 이상 · 평균 4초 이내', seed, zeroErr: seededZero(seed * 5 + 2), needZero: true };
    }
    setPlaying({
      kind, runId, attempt, opts,
      cfg: {
        ...cfg,
        onEnd: res => finish(kind, runId, attempt, res),
        onQuit: () => {
          if ((kind === 'daily' || kind === 'exam1') && !confirm('지금 그만두면 오늘 기회 1번이 사라져요. 그만둘까요?')) return false;
          setPlaying(null); go('home');
        },
      },
    });
    setScreen('game');
  }

  /* ---------- 끝 ---------- */
  async function finish(kind: Kind, runId: string | null, attempt: number, res: EngineResult) {
    const before = store.load();
    const rankBefore = rankOf(before.xp);
    const prev = before.history.find(h => h.mode === kind) ?? null;
    let xp = 0, lines: [string, number][] = [], xpTotal = before.xp, isBest = false, passed: boolean | null = null;
    let attemptsLeft: number | null = kind === 'daily' ? Math.max(0, DAILY_LIMIT - attempt) : null, saveError: string | null = null;

    // 화면 설명용 경험치 내역 (서버 식과 같다)
    const doubled = kind === 'daily' && before.daily.submitted === 0;
    if (kind === 'streak') { xp = streakXP(res.streak); lines = [[`${res.streak}발 × 10 (한 판 상한 300)`, xp]]; }
    else ({ xp, lines } = rangeXP({ hits: res.hits, byDist: res.stats, best: before.bestRange >= 0 && res.hits > before.bestRange, doubled }));

    if (runId) {
      try {
        const s = await api.submitRun(runId, res.log);
        // 서버 계산이 기준
        res.hits = s.hits; res.score = s.score;
        if (kind === 'streak') res.streak = s.hits;
        if (s.xp_gained !== xp) lines = [['경험치 (서버 계산)', s.xp_gained]];
        xp = s.xp_gained; xpTotal = s.xp_total; isBest = s.is_best; passed = s.passed;
        attemptsLeft = s.attempts_left;
      } catch (e) {
        saveError = e instanceof ApiError ? e.message : '기록을 서버에 저장하지 못했어요.';
        xpTotal = before.xp;  // 저장 실패 시 경험치는 주지 않는다
        xp = 0; lines = [['저장 실패로 경험치 없음', 0]];
      }
    } else {
      xpTotal = before.xp + xp;
      if (kind === 'exam1') passed = res.hits >= 18 && res.avg > 0 && res.avg <= 4;
      isBest = kind !== 'streak' && before.bestRange >= 0 && res.hits > before.bestRange;
    }

    const after = store.update(q => {
      rollDay(q);
      q.xp = xpTotal;
      if (kind !== 'exam1' && kind !== 'daily') { q.zero = res.zero; q.zeroDay = kstDay(); }
      if (!q.zero) { q.zero = res.zero; q.zeroDay = kstDay(); }
      if (kind === 'streak') {
        q.bestStreak = Math.max(q.bestStreak, res.streak);
        q.weekStreak.best = Math.max(q.weekStreak.best, res.streak);
      } else {
        q.bestRange = Math.max(q.bestRange, res.hits);
        if (kind === 'daily') { q.daily.best = Math.max(q.daily.best, res.hits); if (!saveError) q.daily.submitted++; }
        if (passed) q.exams = Math.max(q.exams, 1);
      }
      q.history.unshift({ t: Date.now(), mode: kind, hits: kind === 'streak' ? res.streak : res.hits, score: res.score, avg: +res.avg.toFixed(2) });
      q.history = q.history.slice(0, 30);
    });
    setP(after);
    const rankAfter = rankOf(after.xp);
    setResult({
      kind, res, xp, lines, before: rankBefore, after: rankAfter, xpTotal: after.xp, isBest, passed, attempt, attemptsLeft,
      prevHits: prev ? prev.hits : null, prevBestStreak: kind === 'streak' ? before.bestStreak : 0, weekBest: after.weekStreak.best, saveError,
    });
    setPlaying(null);
    setScreen('result');
    if (rankAfter.index > rankBefore.index) {
      const ex = EXAMS.find(e => e.need === rankAfter.name);
      setTimeout(() => setPromo({
        rank: rankAfter.name,
        desc: ex ? `${ex.name} 자격시험이 열렸어요` : rankAfter.next ? `다음 계급 ${rankAfter.next.name}까지 ${fmt(rankAfter.next.xp - after.xp)} XP` : '최고 계급에 올랐어요',
      }), 500);
    }
  }

  function again() {
    if (!result) return go('home');
    const q = store.update(rollDay);
    if (result.kind === 'daily' && q.daily.used >= DAILY_LIMIT) { toast('오늘의 사격 기회를 다 썼어요. 일반 사격으로 할게요'); return play('normal'); }
    if (result.kind === 'exam1' && q.examTries.n >= EXAM_LIMIT) { toast('오늘 시험 기회를 다 썼어요'); return go('exam'); }
    play(result.kind);
  }

  async function share(text: string) {
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) { await navigator.share({ title: '사로', text, url }); return; }
      await navigator.clipboard.writeText(text + '\n너도 쏴봐: ' + url);
      toast('결과가 복사됐어요');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast('공유가 안 되는 환경이에요');
    }
  }

  async function saveNickname(name: string) {
    try {
      const prof = await api.setNickname(name.trim());
      patch(q => { q.nickname = prof.nickname; });
      toast('닉네임을 바꿨어요');
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '저장하지 못했어요');
      return false;
    }
  }

  if (!auth) return <div id="app"><section className="screen ob on"><div className="ob-body"><div className="ob-logo"><span className="sym" style={{ width: 44, height: 44 }} /></div></div></section></div>;
  if (ob) {
    return (
      <div id="app">
        <Onboarding step={ob} online={online} providers={providers} busy={busy} setStep={setOb}
          onProvider={loginWith} onGuest={loginGuest} onOffline={finishOnboarding}
          onNickname={async n => { setBusy(true); const ok = await saveNickname(n); setBusy(false); return ok; }} onDone={finishOnboarding} />
        {toastMsg && <div id="toast" role="status">{toastMsg}</div>}
      </div>
    );
  }

  return (
    <div id="app">
      {screen === 'home' && <Home p={p} online={online} guest={online && auth.kind === 'guest' && providers.length > 0} go={go} play={play} />}
      {screen === 'ranking' && <Ranking online={online} nickname={p.nickname} go={go} onRename={() => { setScreen('records'); setFocusName(true); }} />}
      {screen === 'exam' && <Exam p={p} go={go} play={play} />}
      {screen === 'records' && <Records p={p} online={online} auth={auth} providers={providers} onLink={link} onLogout={logout} go={go} saveNickname={saveNickname} focusName={focusName} reset={() => { store.reset(); setP(store.update(rollDay)); toast('기록을 지웠어요'); }} />}
      {screen === 'game' && playing && <GameScreen cfg={playing.cfg} />}
      {screen === 'result' && result && <Result d={result} go={go} again={again} share={share} />}
      {promo && (
        <div id="promo" role="dialog" aria-modal="true" aria-label="진급">
          <div className="promo-card">
            <span className="muted">진급을 축하해요</span>
            <div className="promo-ins"><Ins rank={promo.rank} /></div>
            <b>{promo.rank} 진급</b>
            <p className="muted">{promo.desc}</p>
            <button className="btn primary" onClick={() => setPromo(null)}>확인</button>
          </div>
        </div>
      )}
      {toastMsg && <div id="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
