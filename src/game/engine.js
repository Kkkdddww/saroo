// 사격 화면 — 측정사격 프로토타입의 밸런스(흔들림·숨·반동·판정)를 그대로 옮기고 모드를 붙였다.
// 모든 월드 좌표는 mrad. 화면 픽셀은 그리기 직전에만 변환한다.
import { mulberry32, shotScore } from '../lib/data';

/**
 * 사격 엔진을 만든다. root 안의 HUD 요소(id)를 찾아 쓰고, destroy()로 이벤트를 모두 걷어낸다.
 * @param {HTMLElement} root
 */
export function createEngine(root) {
const $ = id => root.querySelector('#' + id);
const cv = $('gc');
const ctx = cv.getContext('2d');
const coarse = matchMedia('(pointer:coarse)').matches;
const winListeners = [];
const onWin = (type, fn) => { addEventListener(type, fn); winListeners.push([type, fn]); };

const CLICK = 0.5;            // 1클릭 = 0.5 mrad
const SPREAD = 0.22;          // 총기 자체 탄 퍼짐 (mrad)
const ZERO_GROUPS = 3, PER_GROUP = 3, TOTAL = 20, EXPOSURES = 10;
const DISTS = [100, 150, 200, 250];
const PAPER = { x: 0, y: 3, half: 11 };

let W, H, DPR, M, PPU, SC, RA, OV = null;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  M = Math.min(W, H * 0.75) / 160;
  PPU = Math.min(W * 0.86, H * 0.46) / 44;
  SC = { x: W / 2, y: H * 0.44 };
  RA = Math.min(W, H) * 0.43;
  OV = null;
}
onWin('resize', () => { if (S.running) resize(); });

const rand = (a, b) => a + Math.random() * (b - a);
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* ---------- 소리 ---------- */
let AC = null, noise = null;
function ensureAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(AC.sampleRate * 0.4); noise = AC.createBuffer(1, len, AC.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  } catch (e) { AC = null; }
}
function shotSnd() { if (!AC) return; try { const s = AC.createBufferSource(); s.buffer = noise; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; const g = AC.createGain(); g.gain.value = 0.8; s.connect(f); f.connect(g); g.connect(AC.destination); s.start(); } catch (e) { } }
function hitSnd(delay) { if (!AC) return; try { const t = AC.currentTime + delay; const o = AC.createOscillator(); o.type = 'triangle'; o.frequency.value = 300; const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.2); } catch (e) { } }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } }

/* ---------- 상태 ---------- */
const S = {
  running: false, cfg: null, rng: Math.random, phase: 'idle',
  zero: { x: 0, y: 0 }, holes: [], prev: [], adj: { x: 0, y: 0 }, group: 0,
  aim: { x: 0, y: 0 }, tgt: { x: 0, y: 0 }, rec: { x: 0, y: 0 },
  holding: false, holdStart: 0, lastShot: -1e9,
  ammo: TOTAL, shots: [], hits: 0, exposure: 0, targets: [], exp: null, nextAt: 0, fx: [],
  stats: {}, times: [], marks: [], log: [], score: 0, streak: 0, endInfo: null, msg: '', msgUntil: 0, last: 0, raf: 0,
};
const isStreak = () => S.cfg && S.cfg.mode === 'streak';

/* ---------- 숨·흔들림 (mrad) ---------- */
function holdT(now) { return S.holding ? (now - S.holdStart) / 1000 : 0; }
function swayAmp(now) {
  if (!S.holding) return 2.6;
  const t = holdT(now);
  if (t < 1) return 2.6 - 2.0 * t;
  if (t < 3) return 0.6;
  return Math.min(6, 0.6 + (t - 3) * 1.8);
}
function breathState(now) { if (!S.holding) return 0; const t = holdT(now); if (t < 1) return 1; if (t < 3) return 2; return 3; }
let swA = 2.6;
function sway(now) {
  const T = now / 1000, a = swA;
  const hb = Math.pow(Math.max(0, Math.sin(T * 7.4)), 12) * 0.35;
  return { x: a * (Math.sin(T * 1.1) * 0.6 + Math.sin(T * 2.9 + 1) * 0.4), y: a * (Math.sin(T * 0.9 + 2) * 0.55 + Math.sin(T * 3.4) * 0.45) + hb };
}
function view(now) { const s = sway(now); return { x: S.aim.x + s.x + S.rec.x, y: S.aim.y + s.y + S.rec.y }; }
function shooting() { return S.phase === 'zero' || S.phase === 'range'; }
function canShoot(now) { return (S.phase === 'zero' || (S.phase === 'range' && (isStreak() || S.ammo > 0))) && now - S.lastShot > 280; }

/* ---------- 입력 ---------- */
function holdStart() { ensureAudio(); if (!shooting()) return; S.holding = true; S.holdStart = performance.now(); $('fire').classList.add('down'); }
function holdRelease() { if (!S.holding) return; const now = performance.now(); const held = holdT(now); S.holding = false; $('fire').classList.remove('down'); fire(now, held); }
function clampT() { S.tgt.x = Math.max(-95, Math.min(95, S.tgt.x)); S.tgt.y = Math.max(-40, Math.min(45, S.tgt.y)); }
function setAim(x, y) { S.aim.x = x; S.aim.y = y; S.tgt.x = x; S.tgt.y = y; }
function dragMove(st, e, base) {
  const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
  for (const ev of evs) {
    const dx = ev.clientX - st.x, dy = ev.clientY - st.y, t = ev.timeStamp || performance.now();
    const dt = Math.max(1, t - st.t), v = Math.hypot(dx, dy) / dt;
    const gain = base * (0.75 + 2.4 * Math.min(1, v / 1.4));
    S.tgt.x += dx * gain / M; S.tgt.y += dy * gain / M;
    st.x = ev.clientX; st.y = ev.clientY; st.t = t;
  }
  clampT();
}
let drag = null, fdrag = null;
function mouseAim(e) { if (!shooting()) return; const r = cv.getBoundingClientRect(); S.tgt.x = (e.clientX - r.left - SC.x) / M * 0.9; S.tgt.y = (e.clientY - r.top - SC.y) / M * 0.9; clampT(); }
cv.addEventListener('pointerdown', e => {
  ensureAudio();
  if (e.pointerType === 'mouse') { mouseAim(e); holdStart(); return; }
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() };
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }
});
cv.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouseAim(e); return; }
  if (drag && drag.id === e.pointerId && shooting()) dragMove(drag, e, 0.75);
});
cv.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') { holdRelease(); return; } if (drag && drag.id === e.pointerId) drag = null; });
cv.addEventListener('pointercancel', e => { if (drag && drag.id === e.pointerId) drag = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());
const fb = $('fire');
fb.addEventListener('pointerdown', e => {
  e.preventDefault(); try { fb.setPointerCapture(e.pointerId); } catch (_) { }
  fdrag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() }; holdStart();
});
fb.addEventListener('pointermove', e => { if (fdrag && fdrag.id === e.pointerId && shooting()) dragMove(fdrag, e, 0.3); });
fb.addEventListener('pointerup', e => { e.preventDefault(); fdrag = null; holdRelease(); });
fb.addEventListener('pointercancel', () => { fdrag = null; S.holding = false; fb.classList.remove('down'); });
fb.addEventListener('contextmenu', e => e.preventDefault());
onWin('keydown', e => { if (!S.running) return; if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) holdStart(); } });
onWin('keyup', e => { if (!S.running) return; if (e.code === 'Space') { e.preventDefault(); holdRelease(); } });

/* ---------- 사격 ---------- */
function fire(now, held) {
  if (!canShoot(now)) return;
  S.lastShot = now;
  const v = view(now);
  const ix = v.x + S.zero.x * CLICK + gauss() * SPREAD, iy = v.y + S.zero.y * CLICK + gauss() * SPREAD;
  shotSnd(); buzz(18);
  S.rec.x += rand(-1.5, 1.5); S.rec.y -= rand(7, 9);
  S.tgt.x += rand(-0.7, 0.7); S.tgt.y += rand(-0.9, 0.3); clampT();
  if (S.phase === 'zero') {
    S.holes.push({ u: (ix - PAPER.x) / CLICK, v: (iy - PAPER.y) / CLICK });
    hudShots();
    if (S.holes.length >= PER_GROUP) {
      S.group++; S.phase = 'zeroWait';
      setTimeout(() => { if (S.phase !== 'zeroWait') return; S.phase = 'zeroAdjust'; S.adj = { x: 0, y: 0 }; updClick(); openZeroPanel(); }, 700);
    }
    return;
  }
  if (!isStreak()) S.ammo--;
  let hit = null;
  for (const t of S.targets) { if (hitTest(t, ix, iy, now)) { hit = t; break; } }
  if (hit) {
    hit.hit = true; hit.hitAt = now + hit.d * 1.2; S.hits++; S.stats[hit.d].hit++;
    const h = tSize(hit.d), cy = hit.by - 0.45 * h;
    const t = (now - hit.upAt) / 1000, T = S.exp.dur / 1000;
    const r = Math.hypot(ix - hit.x, iy - cy);
    S.times.push(t); S.score += shotScore(t, T, r, h / 2);
    S.marks.push({ u: (ix - hit.x) / h, v: (iy - cy) / h, hit: 1 });
    S.log.push({ h: 1, d: hit.d, t: +t.toFixed(3), T: +T.toFixed(3), r: +(r / (h / 2)).toFixed(3) });
    S.shots.push(1); hitSnd(0.05 + hit.d / 900);
    if (isStreak()) { S.streak++; flash(S.streak + '연속 명중', 900, 'good'); }
    else flash('명중 · ' + hit.d + 'm', 900, 'good');
  } else {
    S.shots.push(0);
    { const tg0 = nearest(ix, iy); S.log.push({ h: 0, d: tg0 ? tg0.d : 0, t: 0, T: 0, r: 0 }); }
    S.fx.push({ x: ix, y: iy, t0: now });
    const tg = nearest(ix, iy);
    if (tg) {
      const h = tSize(tg.d), dx = ix - tg.x, dy = iy - (tg.by - 0.45 * h);
      S.marks.push({ u: dx / h, v: dy / h, hit: 0 });
      flash('빗나감 · 표적 ' + dirWord(dx, dy) + '으로 갔어요', 1300, 'bad');
      if (isStreak()) endStreak('miss', { dx, dy, d: tg.d, held, n: S.streak + 1 });
    } else if (isStreak()) endStreak('miss', { dx: 0, dy: 0, d: 0, held, n: S.streak + 1 });
  }
  if (S.exp) S.exp.lastShot = now;
  hudShots();
}
function nearest(x, y) {
  let best = null, bd = 1e9;
  for (const t of S.targets) { if (t.hit) continue; const d = Math.hypot(x - t.x, y - t.by); if (d < bd) { bd = d; best = t; } }
  return best;
}
function dirWord(dx, dy) {
  const h = Math.abs(dx) > 0.3 ? (dx > 0 ? '오른쪽' : '왼쪽') : '';
  const v = Math.abs(dy) > 0.3 ? (dy > 0 ? '아래' : '위') : '';
  return (h && v) ? h + ' ' + v : (h || v || '가장자리');
}

/* ---------- 사격장 형상 ---------- */
function tSize(d) { return 1000 / d; }
function rise(t, now) {
  if (t.hit) return 1;
  if (t.lowerAt) return Math.max(0, 1 - (now - t.lowerAt) / 220);
  return Math.min(1, (now - t.upAt) / 200);
}
function hitTest(t, x, y, now) {
  if (t.hit || rise(t, now) < 0.6 || y > t.mound) return false;
  const h = tSize(t.d); const lx = x - t.x, ly = y - t.by;
  const hy = -0.86 * h, hr = 0.13 * h;
  if (lx * lx + (ly - hy) * (ly - hy) <= hr * hr) return true;
  if (ly <= 0 && ly >= -0.74 * h) { const f = (ly + 0.74 * h) / (0.74 * h); return Math.abs(lx) <= (0.15 + 0.1 * f) * h; }
  return false;
}
const EYE = 2.6;
function gy(d) { return EYE * 1000 / d; }
function lx(L, d) { return L * 1000 / d; }
const PITS = [[100, -6], [100, 5], [150, -3], [150, 7.5], [200, -7], [200, 2], [250, -4], [250, 5.5]].map(([d, L]) => ({ d, L, x: lx(L, d) }));

function makeTarget(d, now) {
  const opts = PITS.filter(p => p.d === d); const pit = opts[Math.floor(S.rng() * opts.length)];
  S.stats[d].shown++;
  return { d, pit, x: pit.x, by: gy(d) - 450 / d, mound: gy(d) - 500 / d, upAt: now, hit: false, hitAt: 0, lowerAt: 0 };
}
function startRange() {
  closeZeroPanel();
  S.phase = 'range'; S.ammo = TOTAL; S.hits = 0; S.exposure = 0; S.targets = []; S.exp = null; S.fx = []; S.shots = []; S.times = []; S.score = 0; S.streak = 0; S.marks = []; S.log = [];
  setAim(0, 16);
  S.stats = {}; DISTS.forEach(d => S.stats[d] = { shown: 0, hit: 0 });
  S.nextAt = performance.now() + 2000;
  buildDots();
  flash(isStreak() ? '연속사격 — 빗나가면 끝' : '측정사격 — 표적이 올라오면 사격', 1800);
  hudShots();
}
function streakStage() { return Math.floor(S.streak / 10); }
function startExposure(now) {
  S.exposure++;
  if (isStreak()) {
    const st = streakStage();
    const d = st < 3 ? DISTS[st] : (S.rng() < 0.7 ? 250 : 200);
    S.targets = [makeTarget(d, now)];
    S.exp = { start: now, dur: Math.max(3500, 7000 - st * 800), lastShot: 0, ending: false, endAt: 0 };
  } else {
    const pool = DISTS.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(S.rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    S.targets = [pool[0], pool[1]].map(d => makeTarget(d, now));
    S.exp = { start: now, dur: 8500 - (S.exposure - 1) * 220, lastShot: 0, ending: false, endAt: 0 };
  }
  buildChips();
}
function finish(extra) {
  S.phase = 'end'; S.holding = false;
  const avg = S.times.length ? S.times.reduce((a, b) => a + b, 0) / S.times.length : 0;
  const res = {
    mode: S.cfg.mode, hits: S.hits, stats: S.stats, avg, score: Math.round(S.score),
    zero: { x: S.zero.x, y: S.zero.y }, streak: S.streak, shots: S.shots.slice(), marks: S.marks.slice(), log: S.log.slice(), ...extra,
  };
  setTimeout(() => { stop(); S.cfg.onEnd(res); }, 900);
}
function endRange() { S.targets = []; S.exp = null; finish({}); }
function endStreak(reason, info) {
  if (S.phase !== 'range') return;
  S.phase = 'ending';
  S.targets.forEach(t => { if (!t.hit) t.lowerAt = performance.now(); });
  setTimeout(() => finish({ reason, info, stage: streakStage() + 1 }), 500);
}

/* ---------- 영점 패널 ---------- */
function openZeroPanel() {
  const left = ZERO_GROUPS - S.group;
  $('reBtn').disabled = left <= 0;
  $('reBtn').textContent = left > 0 ? '다시 3발 (' + left + '회 남음)' : '영점 기회 끝';
  let mu = 0, mv = 0; S.holes.forEach(h => { mu += h.u; mv += h.v; }); mu /= S.holes.length; mv /= S.holes.length;
  const hx = Math.round(mu), hy = Math.round(mv);
  const parts = [];
  if (hx) parts.push((hx > 0 ? '오른쪽 ' : '왼쪽 ') + Math.abs(hx));
  if (hy) parts.push((hy > 0 ? '아래 ' : '위 ') + Math.abs(hy));
  $('zeroTitle').textContent = parts.length ? '탄착군 중심이 ' + parts.join(' · ') + '클릭 벗어났어요' : '탄착군이 중앙에 모였어요';
  $('zeroRound').textContent = S.group + '조 결과';
  $('zeroPanel').classList.add('show');
  hudShots();
}
function closeZeroPanel() { $('zeroPanel').classList.remove('show'); }
function updClick() {
  const a = S.adj, p = [];
  if (a.x) p.push((a.x < 0 ? '왼쪽 ' : '오른쪽 ') + Math.abs(a.x));
  if (a.y) p.push((a.y < 0 ? '위 ' : '아래 ') + Math.abs(a.y));
  $('clickInfo').textContent = p.length ? '조정: ' + p.join(' · ') + '클릭' : '아직 조정 안 함';
}
root.querySelectorAll('#zeroPanel .pad button').forEach(b => b.addEventListener('click', () => {
  const d = b.dataset.d;
  const dx = d === 'l' ? -1 : d === 'r' ? 1 : 0, dy = d === 'u' ? -1 : d === 'd' ? 1 : 0;
  S.zero.x += dx; S.zero.y += dy; S.adj.x += dx; S.adj.y += dy; updClick();
}));
$('reBtn').addEventListener('click', () => {
  S.prev = S.holes.slice(); S.holes = []; S.adj = { x: 0, y: 0 }; S.phase = 'zero'; setAim(0, PAPER.y + 4); closeZeroPanel(); hudShots();
});
$('rangeBtn').addEventListener('click', startRange);
$('quitBtn').addEventListener('click', () => { if (!S.running) return; const cb = S.cfg.onQuit; if (cb && cb() === false) return; stop(); });

/* ---------- 메시지 ---------- */
let flashKind = '';
function flash(t, ms, kind = '') { S.msg = t; S.msgUntil = performance.now() + ms; flashKind = kind; }

/* ---------- 매 프레임 ---------- */
function update(now) {
  const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now;
  swA += (swayAmp(now) - swA) * Math.min(1, dt * 6);
  const k = Math.exp(-dt / 0.11); S.rec.x *= k; S.rec.y *= k;
  const f = 1 - Math.exp(-dt / 0.045); S.aim.x += (S.tgt.x - S.aim.x) * f; S.aim.y += (S.tgt.y - S.aim.y) * f;
  if (S.phase === 'range') {
    if (S.exp) {
      const e = S.exp, el = now - e.start;
      const allDown = S.targets.every(t => t.hit && now - t.hitAt > 350);
      if (!e.ending && (el > e.dur || allDown || (!isStreak() && S.ammo <= 0 && now - e.lastShot > 500))) {
        e.ending = true; e.endAt = now;
        S.targets.forEach(t => { if (!t.hit) t.lowerAt = now; });
        if (isStreak() && !allDown) { const t = S.targets[0]; endStreak('timeout', { d: t ? t.d : 0, n: S.streak + 1 }); }
      }
      if (e.ending && now - e.endAt > 320 && S.phase === 'range') { S.exp = null; S.targets = []; S.nextAt = now + (isStreak() ? 600 : 1100); buildChips(); }
    } else if (now >= S.nextAt) {
      if (!isStreak() && (S.exposure >= EXPOSURES || S.ammo <= 0)) endRange();
      else startExposure(now);
    }
  }
  S.fx = S.fx.filter(f => now - f.t0 < 800);
}

/* ---------- 사격장 그리기 ---------- */
const HILL_D = 420;
let hill = [], blobs = [], farRidge = [];
(function initScene() {
  const r = mulberry32(7);
  const rr = (a, b) => a + r() * (b - a);
  for (let i = 0; i <= 80; i++) { const x = -280 + i * 7; hill.push([x, -(36 + 13 * Math.sin(x * 0.016 + 1) + 6 * Math.sin(x * 0.051 + 2) + r() * 2.5)]); }
  for (let i = 0; i <= 60; i++) { const x = -300 + i * 10; farRidge.push([x, -(52 + 10 * Math.sin(x * 0.011) + r() * 4)]); }
  for (let i = 0; i < 260; i++) { const x = rr(-280, 280); const top = hillTop(x); blobs.push({ x, y: rr(top + 1, gy(HILL_D) - 1), r: rr(1.4, 3.6), c: r() }); }
})();
function hillTop(x) { const i = Math.max(0, Math.min(hill.length - 2, Math.floor((x + 280) / 7))); const a = hill[i], b = hill[i + 1]; const t = (x - a[0]) / 7; return a[1] + (b[1] - a[1]) * t; }

function drawWorld(now) {
  const v = view(now);
  const X = wx => SC.x + (wx - v.x) * M, Y = wy => SC.y + (wy - v.y) * M;
  let g = ctx.createLinearGradient(0, Y(-160), 0, Y(0)); g.addColorStop(0, '#7c9fbc'); g.addColorStop(1, '#e3e6dd');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#9aa8a2'; ctx.beginPath(); ctx.moveTo(X(-300), Y(10));
  farRidge.forEach(p => ctx.lineTo(X(p[0]), Y(p[1]))); ctx.lineTo(X(300), Y(10)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#46573a'; ctx.beginPath(); ctx.moveTo(X(-280), Y(gy(HILL_D) + 1));
  hill.forEach(p => ctx.lineTo(X(p[0]), Y(p[1]))); ctx.lineTo(X(280), Y(gy(HILL_D) + 1)); ctx.closePath(); ctx.fill();
  blobs.forEach(b => { ctx.fillStyle = b.c < .5 ? 'rgba(30,44,24,.5)' : 'rgba(96,114,70,.45)'; ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), b.r * M, 0, 7); ctx.fill(); });
  ctx.fillStyle = '#9c8459'; ctx.beginPath();
  ctx.moveTo(X(-75), Y(gy(HILL_D) + 0.5)); ctx.lineTo(X(-52), Y(-9)); ctx.quadraticCurveTo(X(0), Y(-17), X(55), Y(-8)); ctx.lineTo(X(78), Y(gy(HILL_D) + 0.5)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(60,45,30,.22)';
  for (let i = 0; i < 7; i++) ctx.fillRect(X(-60 + i * 18), Y(-6 + (i % 3)), 3 * M, 1.2 * M);
  // 지면
  g = ctx.createLinearGradient(0, Y(gy(HILL_D)), 0, Y(60)); g.addColorStop(0, '#a99a6c'); g.addColorStop(0.25, '#8a8a55'); g.addColorStop(1, '#5f6b3d');
  ctx.fillStyle = g; ctx.fillRect(0, Y(gy(HILL_D)), W, H);
  for (let d = 400, k = 0; d > 30; d -= 25, k++) {
    ctx.fillStyle = k % 2 ? 'rgba(255,255,220,.05)' : 'rgba(0,0,0,.05)';
    const y1 = Y(gy(d)), y2 = Y(gy(d - 25)); ctx.fillRect(0, y1, W, y2 - y1);
  }
  // 아지랑이
  g = ctx.createLinearGradient(0, Y(-12), 0, Y(8)); g.addColorStop(0, 'rgba(238,241,235,0)'); g.addColorStop(0.6, 'rgba(238,241,235,.35)'); g.addColorStop(1, 'rgba(238,241,235,0)');
  ctx.fillStyle = g; ctx.fillRect(0, Y(-12), W, 20 * M);
  ctx.strokeStyle = 'rgba(240,240,225,.5)'; ctx.lineWidth = 1;
  [-10, 10].forEach(L => { ctx.beginPath(); ctx.moveTo(X(lx(L, 380)), Y(gy(380))); ctx.lineTo(X(lx(L, 28)), Y(gy(28))); ctx.stroke(); });
  [300, 250, 200, 150, 100, 50].forEach(d => [-10, 10].forEach(L => {
    const x = X(lx(L, d)), y = Y(gy(d)), h = 1200 / d * M, w = Math.max(1, 150 / d * M);
    ctx.fillStyle = '#eee'; ctx.fillRect(x - w / 2, y - h, w, h); ctx.fillStyle = '#c0392b'; ctx.fillRect(x - w / 2, y - h, w, h * 0.3);
  }));
  DISTS.forEach(d => {
    const x = X(lx(-9, d)), y = Y(gy(d)), s = 1000 / d * M;
    ctx.fillStyle = '#555'; ctx.fillRect(x - s * 0.04, y - s * 1.0, Math.max(1, s * 0.08), s * 1.0);
    ctx.fillStyle = '#f4f2e8'; ctx.fillRect(x - s * 0.5, y - s * 1.5, s, s * 0.6);
    if (s * 0.45 >= 6) { ctx.fillStyle = '#222'; ctx.font = '800 ' + Math.round(s * 0.45) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d, x, y - s * 1.2); ctx.textBaseline = 'alphabetic'; }
  });
  { const d = 80, x = X(lx(9.5, d)), y = Y(gy(d)), s = 1000 / d * M;
    ctx.fillStyle = '#ccc'; ctx.fillRect(x - 1, y - s * 5, 2, s * 5);
    const w = Math.sin(now / 300) * s * 0.12; ctx.fillStyle = '#c62f24'; ctx.beginPath();
    ctx.moveTo(x, y - s * 5); ctx.quadraticCurveTo(x + s * 0.6, y - s * 5 + w, x + s * 1.3, y - s * 4.85); ctx.quadraticCurveTo(x + s * 0.6, y - s * 4.4 - w, x, y - s * 4.3); ctx.closePath(); ctx.fill(); }
  if (S.phase === 'zero' || S.phase === 'zeroWait') {
    ctx.fillStyle = '#5b4a30';
    const by = Y(gy(25));
    ctx.fillRect(X(PAPER.x - PAPER.half * 0.75) - 2, Y(PAPER.y), 4, by - Y(PAPER.y));
    ctx.fillRect(X(PAPER.x + PAPER.half * 0.75) - 2, Y(PAPER.y), 4, by - Y(PAPER.y));
    ctx.fillStyle = '#8a7a58'; ctx.fillRect(X(PAPER.x - PAPER.half * 1.2), Y(PAPER.y - PAPER.half * 1.15), PAPER.half * 2.4 * M, PAPER.half * 2.3 * M);
    drawPaper(X(PAPER.x), Y(PAPER.y), M * CLICK, false);
  } else {
    PITS.slice().sort((a, b) => b.d - a.d).forEach(p => {
      S.targets.filter(t => t.pit === p).forEach(t => drawTarget(t, now, X, Y));
      const d = p.d, x = X(p.x), y = Y(gy(d)), s = 1000 / d * M;
      ctx.fillStyle = '#937d55'; ctx.beginPath();
      ctx.moveTo(x - s * 1.3, y); ctx.quadraticCurveTo(x - s * 0.9, y - s * 0.5, x - s * 0.6, y - s * 0.5); ctx.lineTo(x + s * 0.6, y - s * 0.5);
      ctx.quadraticCurveTo(x + s * 0.9, y - s * 0.5, x + s * 1.3, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,.12)'; ctx.fillRect(x - s * 0.6, y - s * 0.5, s * 1.2, Math.max(1, s * 0.08));
    });
    S.fx.forEach(f => {
      const a = (now - f.t0) / 800;
      ctx.fillStyle = 'rgba(214,196,150,' + (0.85 * (1 - a)) + ')'; ctx.beginPath(); ctx.arc(X(f.x), Y(f.y) - a * 6, 1.5 + a * 7, 0, 7); ctx.fill();
    });
  }
  for (let r = 0; r < 3; r++) {
    const y0 = 44 + r * 9;
    for (let i = -14; i <= 14; i++) {
      const x0 = i * 24 + (r % 2) * 12;
      const gx = ctx.createLinearGradient(0, Y(y0), 0, Y(y0 + 9));
      gx.addColorStop(0, '#867a57'); gx.addColorStop(1, '#544b33');
      ctx.fillStyle = gx; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(X(x0), Y(y0), 23 * M, 9.5 * M, 4 * M); else ctx.rect(X(x0), Y(y0), 23 * M, 9.5 * M);
      ctx.fill();
    }
  }
}
function drawTarget(t, now, X, Y) {
  const r = rise(t, now); if (r <= 0) return;
  let sy = r;
  if (t.hit) { const a = Math.max(0, Math.min(1, (now - t.hitAt) / 300)); sy = 1 - a; if (sy <= 0) return; }
  const h = tSize(t.d) * M;
  ctx.save(); ctx.translate(X(t.x), Y(t.by)); ctx.scale(1, sy);
  ctx.fillStyle = '#34432a';
  ctx.beginPath(); ctx.arc(0, -0.86 * h, 0.13 * h, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.15 * h, -0.74 * h); ctx.lineTo(0.15 * h, -0.74 * h); ctx.lineTo(0.25 * h, 0); ctx.lineTo(-0.25 * h, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- 가늠자·가늠쇠 (미리 그려 둔 레이어) ---------- */
function buildOverlay() {
  OV = document.createElement('canvas'); OV.width = W * DPR; OV.height = H * DPR;
  const c = OV.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cx = SC.x, cy = SC.y;
  // 가늠쇠 — K2(M16 계열): 가운데 기둥 + 양쪽 보호 귀 + U자 받침. 밝은 배경 앞 거의 검은 실루엣.
  const pw = Math.max(5, 3.4 * M);              // 기둥 폭 = 3.4 mrad
  const tip = cy, base = cy + pw * 6.4;           // 기둥 끝 = 조준점
  const earIn = pw * 3.25, earT = pw * 0.78, earTop = cy - pw * 0.72;
  const flare = pw * 0.55, bottom = cy + RA * 1.2;
  c.save();
  c.beginPath(); c.arc(cx, cy, RA * 0.985, 0, 7); c.clip();
  const vg = c.createLinearGradient(0, earTop, 0, base + pw * 3);
  vg.addColorStop(0, '#2C2F31'); vg.addColorStop(0.15, '#1C1E1F'); vg.addColorStop(0.6, '#141516'); vg.addColorStop(1, '#0E0F10');
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(cx + s * (earIn + earT + flare * 4), bottom);
    c.lineTo(cx + s * (earIn + earT), earTop + pw * 0.4);
    c.quadraticCurveTo(cx + s * (earIn + earT), earTop, cx + s * (earIn + earT * 0.45), earTop);
    c.quadraticCurveTo(cx + s * earIn, earTop, cx + s * earIn, earTop + pw * 0.35);
    c.lineTo(cx + s * earIn, base - pw * 3.1);
    c.quadraticCurveTo(cx + s * earIn, base, cx, base);
    c.lineTo(cx, bottom); c.closePath();
    c.fillStyle = vg; c.fill();
    // 귀 바깥면은 더 어둡게, 안쪽 모서리에 하늘빛
    const hg = c.createLinearGradient(cx + s * (earIn + earT + flare), 0, cx + s * earIn, 0);
    hg.addColorStop(0, 'rgba(14,15,16,.7)'); hg.addColorStop(0.6, 'rgba(14,15,16,0)'); hg.addColorStop(1, 'rgba(154,163,168,' + (s < 0 ? .22 : .15) + ')');
    c.beginPath();
    c.moveTo(cx + s * (earIn + earT + flare * 4), bottom); c.lineTo(cx + s * (earIn + earT), earTop + pw * 0.4);
    c.quadraticCurveTo(cx + s * (earIn + earT), earTop, cx + s * (earIn + earT * 0.45), earTop);
    c.quadraticCurveTo(cx + s * earIn, earTop, cx + s * earIn, earTop + pw * 0.35);
    c.lineTo(cx + s * earIn, bottom); c.closePath();
    c.fillStyle = hg; c.fill();
    c.strokeStyle = 'rgba(165,173,178,' + (s < 0 ? .5 : .4) + ')'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(cx + s * (earIn + earT - 0.5), earTop + pw * 0.45);
    c.quadraticCurveTo(cx + s * (earIn + earT - 0.5), earTop + 0.6, cx + s * (earIn + earT * 0.45), earTop + 0.6);
    c.quadraticCurveTo(cx + s * (earIn + 0.5), earTop + 0.6, cx + s * (earIn + 0.5), earTop + pw * 0.4); c.stroke();
  }
  c.strokeStyle = 'rgba(141,150,155,.28)'; c.lineWidth = 0.9;
  c.beginPath(); c.moveTo(cx - earIn + 0.5, earTop + pw * 0.6); c.lineTo(cx - earIn + 0.5, base - pw * 3.1);
  c.quadraticCurveTo(cx - earIn + 0.5, base - 0.5, cx, base - 0.5); c.quadraticCurveTo(cx + earIn - 0.5, base - 0.5, cx + earIn - 0.5, base - pw * 3.1);
  c.lineTo(cx + earIn - 0.5, earTop + pw * 0.6); c.stroke();
  // 영점 조절 다이얼 (기둥 밑동)
  c.fillStyle = '#101112'; c.beginPath(); c.ellipse(cx, base - pw * 0.25, pw * 0.95, pw * 0.32, 0, 0, 7); c.fill();
  c.strokeStyle = 'rgba(94,100,104,.5)'; c.beginPath(); c.ellipse(cx, base - pw * 0.3, pw * 0.85, pw * 0.22, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  // 기둥
  const pg = c.createLinearGradient(cx - pw / 2, 0, cx + pw / 2, 0);
  pg.addColorStop(0, '#34383B'); pg.addColorStop(0.14, '#202325'); pg.addColorStop(0.85, '#17191A'); pg.addColorStop(1, '#0D0E0F');
  c.fillStyle = pg;
  c.beginPath(); c.moveTo(cx - pw * 0.62, base); c.lineTo(cx - pw / 2, tip + 2); c.quadraticCurveTo(cx - pw / 2, tip, cx - pw / 2 + 2, tip);
  c.lineTo(cx + pw / 2 - 2, tip); c.quadraticCurveTo(cx + pw / 2, tip, cx + pw / 2, tip + 2); c.lineTo(cx + pw * 0.62, base); c.closePath(); c.fill();
  c.fillStyle = 'rgba(180,187,191,.55)'; c.fillRect(cx - pw / 2 + 1.5, tip + 0.3, pw - 3, 0.9);
  c.fillStyle = 'rgba(126,134,139,.4)'; c.fillRect(cx - pw / 2 + 0.2, tip + 2, 0.9, base - tip - 4);
  c.restore();
  // 뒤 가늠자 구멍: 경계 없이 바깥으로 갈수록 어두워진다 (초점 밖)
  const R = Math.hypot(W, H);
  const g = c.createRadialGradient(cx, cy, RA * 0.78, cx, cy, R);
  const k = RA / R;
  g.addColorStop(0, 'rgba(11,12,11,0)');
  g.addColorStop(Math.min(.99, (RA * 0.96 - RA * 0.78) / (R - RA * 0.78)), 'rgba(11,12,11,.35)');
  g.addColorStop(Math.min(.99, (RA * 1.1 - RA * 0.78) / (R - RA * 0.78)), 'rgba(11,12,11,.86)');
  g.addColorStop(Math.min(.99, (RA * 1.35 - RA * 0.78) / (R - RA * 0.78)), 'rgba(13,14,13,.94)');
  g.addColorStop(1, 'rgba(9,10,9,.97)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // 구멍 가장자리에 빛이 살짝 번진다
  const gl = c.createRadialGradient(cx, cy, RA * 0.82, cx, cy, RA * 1.02);
  gl.addColorStop(0, 'rgba(243,241,232,0)'); gl.addColorStop(0.75, 'rgba(243,241,232,.12)'); gl.addColorStop(1, 'rgba(243,241,232,0)');
  c.fillStyle = gl; c.beginPath(); c.arc(cx, cy, RA * 1.02, 0, 7); c.fill();
  void k;
}
function drawSights(now) {
  if (!OV || OV.width !== Math.round(W * DPR)) buildOverlay();
  const since = now - S.lastShot;
  if (since < 70) { ctx.fillStyle = 'rgba(255,205,120,' + (1 - since / 70) * 0.5 + ')'; ctx.beginPath(); ctx.arc(SC.x, SC.y - 12, RA * 0.6, 0, 7); ctx.fill(); }
  ctx.drawImage(OV, 0, 0, W, H);
  // 숨 게이지: 가늠자 테두리
  const bs = breathState(now);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.beginPath(); ctx.arc(SC.x, SC.y, RA + 12, 0, 7); ctx.stroke();
  if (S.holding) {
    const p = Math.min(1, holdT(now) / 5);
    ctx.strokeStyle = ['#888', '#E9D27A', '#C3D497', '#F0915F'][bs]; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(SC.x, SC.y, RA + 12, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke(); ctx.lineCap = 'butt';
  }
}

function drawPaper(cx, cy, ppu, detail) {
  const half = 22 * ppu;
  ctx.fillStyle = '#EDE9DC'; ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  if (detail) {
    ctx.lineWidth = 1;
    for (let i = -22; i <= 22; i++) {
      ctx.strokeStyle = i % 5 === 0 ? 'rgba(86,105,47,.45)' : 'rgba(86,105,47,.14)';
      ctx.beginPath(); ctx.moveTo(cx + i * ppu, cy - half); ctx.lineTo(cx + i * ppu, cy + half); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - half, cy + i * ppu); ctx.lineTo(cx + half, cy + i * ppu); ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(45,51,33,.92)';
  ctx.beginPath(); ctx.arc(cx, cy - 9 * ppu, 3.4 * ppu, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - 4.5 * ppu, cy - 5 * ppu); ctx.lineTo(cx + 4.5 * ppu, cy - 5 * ppu); ctx.lineTo(cx + 7 * ppu, cy + 11 * ppu); ctx.lineTo(cx - 7 * ppu, cy + 11 * ppu); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#E9D27A'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.2, 1.6 * ppu), 0, 7); ctx.fill();
  if (detail) { ctx.strokeStyle = '#56692F'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(cx, cy, 2.6 * ppu, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
}
function drawInspect() {
  ctx.fillStyle = '#111310'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = Math.min(H * 0.34, 40 + 22 * PPU + 70), half = 22 * PPU;
  ctx.fillStyle = '#EDE9DC'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - half - 10, cy - half - 10, half * 2 + 20, half * 2 + 20, 14); else ctx.rect(cx - half - 10, cy - half - 10, half * 2 + 20, half * 2 + 20); ctx.fill();
  drawPaper(cx, cy, PPU, true);
  ctx.fillStyle = 'rgba(80,74,58,.85)'; ctx.font = '500 11px "Noto Sans KR",sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('25m 영점표적 · 한 칸 = 1클릭', cx - half + 6, cy + half - 8);
  const hr = Math.max(3, 0.3 * PPU);
  S.prev.forEach(h => { ctx.fillStyle = 'rgba(90,90,80,.4)'; ctx.beginPath(); ctx.arc(cx + h.u * PPU, cy + h.v * PPU, hr, 0, 7); ctx.fill(); });
  S.holes.forEach(h => {
    const x = cx + h.u * PPU, y = cy + h.v * PPU;
    if (Math.abs(h.u) > 22 || Math.abs(h.v) > 22) return;
    ctx.fillStyle = '#1B1C18'; ctx.beginPath(); ctx.arc(x, y, hr, 0, 7); ctx.fill();
    ctx.strokeStyle = '#C9BFA6'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, hr + 1.5, 0, 7); ctx.stroke();
  });
  const off = S.holes.filter(h => Math.abs(h.u) > 22 || Math.abs(h.v) > 22).length;
  if (off) { ctx.fillStyle = '#F0915F'; ctx.textAlign = 'center'; ctx.font = '700 12px "Noto Sans KR",sans-serif'; ctx.fillText('표적지 밖 ' + off + '발', cx, cy + half + 26); }
  if (S.holes.length) {
    let mu = 0, mv = 0; S.holes.forEach(h => { mu += h.u; mv += h.v; }); mu /= S.holes.length; mv /= S.holes.length;
    const x = cx + Math.max(-24, Math.min(24, mu + S.adj.x)) * PPU, y = cy + Math.max(-24, Math.min(24, mv + S.adj.y)) * PPU;
    ctx.strokeStyle = '#D2502A'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(x, y, 1.6 * PPU, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x - 2.4 * PPU, y); ctx.lineTo(x + 2.4 * PPU, y); ctx.moveTo(x, y - 2.4 * PPU); ctx.lineTo(x, y + 2.4 * PPU); ctx.stroke();
  }
}

/* ---------- HUD ---------- */
function buildDots() {
  const box = $('hudDots'); box.innerHTML = '';
  if (isStreak()) return;
  for (let i = 0; i < TOTAL; i++) box.appendChild(document.createElement('i'));
}
function hudShots() {
  const zeroing = S.phase === 'zero' || S.phase === 'zeroWait' || S.phase === 'zeroAdjust';
  $('hud').classList.toggle('zeroing', zeroing);
  $('hud').classList.toggle('streak', isStreak() && !zeroing);
  if (zeroing) {
    $('hudSub').textContent = '영점사격 25m · ' + Math.min(S.group + (S.phase === 'zero' ? 1 : 0), ZERO_GROUPS) + '/' + ZERO_GROUPS + '조';
    $('hudCount').innerHTML = S.holes.length + '<small>/3</small>';
    $('hudInfo').textContent = '노란 점을 노리고 3발';
    return;
  }
  $('hudSub').textContent = S.cfg.sub;
  if (isStreak()) {
    $('streakN').textContent = S.streak;
    $('streakStage').textContent = (streakStage() + 1) + '단계';
    $('hudCount').innerHTML = '';
    const seg = $('streakSeg'); seg.innerHTML = '';
    for (let i = 0; i < 10; i++) { const s = document.createElement('i'); if (i < S.streak % 10) s.className = 'on'; seg.appendChild(s); }
    $('hudInfo').textContent = '';
    return;
  }
  $('hudCount').innerHTML = (TOTAL - S.ammo) + '<small>/20</small>';
  const dots = $('hudDots').children;
  for (let i = 0; i < dots.length; i++) dots[i].className = i < S.shots.length ? (S.shots[i] ? 'hit' : 'miss') : '';
  const avg = S.times.length ? (S.times.reduce((a, b) => a + b, 0) / S.times.length).toFixed(1) + '초' : '-';
  $('hudInfo').textContent = '명중 ' + S.hits + ' · 평균 ' + avg;
}
function buildChips() {
  const box = $('hudChips'); box.innerHTML = '';
  S.targets.forEach((t, i) => {
    const el = document.createElement('div'); el.className = 'chip' + (i === 0 ? ' on' : '');
    el.innerHTML = '<b>' + t.d + 'm</b><span class="bar"><span></span></span><em></em>';
    t.el = el; box.appendChild(el);
  });
}
function hudFrame(now) {
  if (S.exp && !S.exp.ending) {
    const left = Math.max(0, S.exp.dur - (now - S.exp.start));
    S.targets.forEach(t => {
      if (!t.el) return;
      t.el.classList.toggle('done', t.hit);
      t.el.querySelector('.bar span').style.width = (t.hit ? 0 : left / S.exp.dur * 100) + '%';
      t.el.querySelector('em').textContent = t.hit ? '명중' : (left / 1000).toFixed(1) + '초';
      t.el.classList.toggle('warn', !t.hit && left < 2500);
    });
  }
  const msg = $('hudMsg');
  if (now < S.msgUntil) { msg.textContent = S.msg; msg.className = 'show ' + flashKind; }
  else msg.className = '';
  const bs = breathState(now);
  const bl = $('breathLbl');
  bl.textContent = shooting() ? ['', '숨 참는 중', '안정 · 지금 쏘세요', '흔들림이 커져요'][bs] : '';
  bl.className = 'b' + bs;
  const p = S.holding ? Math.min(1, holdT(now) / 5) : 0;
  const col = ['#888', '#E9D27A', '#C3D497', '#F0915F'][bs];
  fb.style.background = 'conic-gradient(' + col + ' ' + (p * 360) + 'deg, rgba(255,255,255,.14) 0)';
}

/* ---------- 루프 ---------- */
function frame(now) {
  if (!S.running) return;
  update(now);
  if (S.phase === 'zeroAdjust') drawInspect();
  else { drawWorld(now); drawSights(now); }
  hudFrame(now);
  S.raf = requestAnimationFrame(frame);
}

function start(cfg) {
  S.cfg = cfg; S.running = true;
  S.rng = cfg.seed != null ? mulberry32(cfg.seed) : Math.random;
  $('hudTitle').textContent = cfg.title;
  $('rangeBtn').textContent = cfg.mode === 'streak' ? '연속사격 시작' : '측정사격 시작';
  $('hudSub').textContent = cfg.sub;
  $('desktopTip').style.display = coarse ? 'none' : 'block';
  fb.parentElement.style.display = coarse ? 'flex' : 'none';
  resize();
  S.holes = []; S.prev = []; S.adj = { x: 0, y: 0 }; S.group = 0; S.fx = []; S.rec = { x: 0, y: 0 }; S.shots = []; S.targets = []; S.exp = null;
  S.zero = { x: cfg.zeroErr.x, y: cfg.zeroErr.y };
  $('hudChips').innerHTML = '';
  if (cfg.needZero) {
    S.phase = 'zero'; setAim(0, PAPER.y + 4); buildDots();
    flash('영점사격 25m — 노란 조준점을 노리고 3발', 2600);
    hudShots();
  } else startRange();
  cancelAnimationFrame(S.raf);
  S.raf = requestAnimationFrame(frame);
}
function stop() {
  S.running = false; S.phase = 'idle'; S.holding = false;
  cancelAnimationFrame(S.raf); closeZeroPanel();
}


// 점검용: 주소 끝에 #debug 를 붙였을 때만 상태를 노출한다
if (location.hash === '#debug') window.__saro = { S, tSize };

function destroy() { stop(); winListeners.forEach(([t, f]) => removeEventListener(t, f)); }
return { start, stop, destroy, ensureAudio };
}
