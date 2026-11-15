import type { EngineResult, Mark } from '../game/engine';
import { fmt, grade, type RankInfo } from '../lib/data';
import { BackIcon, Ins, type Screen } from '../components/ui';
import type { Kind } from '../App';

export interface ResultData {
  kind: Kind;
  res: EngineResult;
  xp: number;
  lines: [string, number][];
  before: RankInfo;
  after: RankInfo;
  xpTotal: number;
  isBest: boolean;
  passed: boolean | null;
  attempt: number;
  attemptsLeft: number | null;
  prevHits: number | null;
  prevBestStreak: number;
  weekBest: number;
  saveError: string | null;
}

function Silhouette({ marks, w = 120, h = 168 }: { marks: Mark[]; w?: number; h?: number }) {
  // 표적 높이 1 = 140px, 가슴 중앙 (60, 96)
  const S = 140, cx = 60, cy = 96;
  const hy = cy - 0.41 * S, ty = cy - 0.29 * S, by = cy + 0.45 * S;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="탄착 분포">
      <circle cx={cx} cy={hy} r={0.13 * S} fill="#DADDD5" />
      <path d={`M${cx - 0.15 * S} ${ty} L${cx + 0.15 * S} ${ty} L${cx + 0.25 * S} ${by} L${cx - 0.25 * S} ${by} Z`} fill="#DADDD5" />
      <circle cx={cx} cy={cy} r={0.12 * S} fill="none" stroke="#B5BAB0" strokeDasharray="3 3" />
      {marks.map((m, i) => {
        const x = cx + m.u * S, y = cy + m.v * S;
        if (x < -10 || x > w + 10 || y < -10 || y > h + 10) return null;
        return m.hit ? <circle key={i} cx={x} cy={y} r={3.6} fill="#191B1D" /> : <circle key={i} cx={x} cy={y} r={4.5} fill="none" stroke="#D2502A" strokeWidth={2} />;
      })}
    </svg>
  );
}

function XpCard({ d }: { d: ResultData }) {
  const r = d.after;
  const span = r.next ? r.next.xp - r.base : 1;
  const now = r.next ? (d.xpTotal - r.base) / span * 100 : 100;
  const gain = r.next ? Math.min(now, d.xp / span * 100) : 0;
  return (
    <div className="card soft">
      <div className="xph"><Ins rank={r.name} /><div className="g"><b>경험치 +{fmt(d.xp)}</b><span>{r.next ? `${r.next.name}까지 ${fmt(r.next.xp - d.xpTotal)}` : '최고 계급'}</span></div></div>
      <div className="xpbar2"><i className="a" style={{ width: (now - gain).toFixed(1) + '%' }} /><i className="b" style={{ width: gain.toFixed(1) + '%' }} /></div>
      {d.lines.map((l, i) => <div key={i} className={'xpline' + (l[0].includes('×') ? ' sum' : '')}><span>{l[0]}</span><b>{fmt(l[1])}</b></div>)}
    </div>
  );
}

interface Props { d: ResultData; go: (s: Screen) => void; again: () => void; share: (text: string) => void }

export default function Result({ d, go, again, share }: Props) {
  const { res } = d;
  const isStreak = d.kind === 'streak';
  const g = grade(res.hits);
  const kicker = d.kind === 'daily' ? `오늘의 사격 ${d.attempt}번째 결과` : d.kind === 'exam1' ? '특등사수 자격시험 결과' : isStreak ? '연속사격 결과' : '측정사격 결과';

  let againLabel = '한 판 더';
  if (d.kind === 'daily') againLabel = d.attemptsLeft ? `다시 쏘기 (오늘 ${d.attemptsLeft}번 남음)` : '일반 사격 하기';

  return (
    <section className="screen light on">
      <div className="scroll white">
        <header className="topbar"><button className="iconbtn" onClick={() => go('home')} aria-label="홈으로"><BackIcon /></button></header>
        {d.saveError && <div className="note bad">{d.saveError} 이 기기에만 기록했어요.</div>}
        <div className="pad">
          <span className="muted">{kicker}</span>
          <div className="bigline">
            <span className="big num">{isStreak ? res.streak : res.hits}</span>
            <span className="bigsub num">{isStreak ? '연속 명중' : '/ 20발'}</span>
            {isStreak ? (res.streak > d.prevBestStreak && <span className="tag olive">최고 기록</span>)
              : <span className={'tag ' + (g === '불합격' ? 'bad' : 'olive')}>{g === '불합격' || g === '특등사수' ? g : g + ' 사수'}</span>}
          </div>
          <p className="compare">
            {isStreak
              ? (res.streak > d.prevBestStreak ? (d.prevBestStreak ? `이전 최고 ${d.prevBestStreak}연속을 넘었어요` : '첫 기록이에요') : `내 최고 기록은 ${d.prevBestStreak}연속이에요`)
              : d.prevHits == null ? '첫 기록이에요'
                : res.hits > d.prevHits ? `지난번보다 ${res.hits - d.prevHits}발 더 맞혔어요`
                  : res.hits < d.prevHits ? `지난번보다 ${d.prevHits - res.hits}발 적어요` : '지난번과 같은 기록이에요'}
          </p>
        </div>

        <div className="stats3 bordered">
          {isStreak ? <>
            <div><span>도달 단계</span><b className="num">{res.stage}단계</b></div>
            <div><span>평균 사격 시간</span><b className="num">{res.avg ? res.avg.toFixed(1) + '초' : '-'}</b></div>
            <div><span>이번 주 최고</span><b className="num">{d.weekBest}연속</b></div>
          </> : <>
            <div><span>종합 점수</span><b className="num">{fmt(res.score)}</b></div>
            <div><span>평균 사격 시간</span><b className="num">{res.avg ? res.avg.toFixed(1) + '초' : '-'}</b></div>
            <div><span>남은 영점 오차</span><b className="num">{Math.round(Math.hypot(res.zero.x, res.zero.y))}클릭</b></div>
          </>}
        </div>

        <XpCard d={d} />

        {d.passed != null && (
          <div className="block">
            {d.passed
              ? <div className="passbox ok"><span className="disc badge-1">1</span><div><b>합격 · 특등사수 휘장</b><p className="muted">랭킹에 휘장이 붙어요.</p></div></div>
              : <div className="passbox no"><div><b>불합격</b><p className="muted">18발 이상, 평균 4초 이내가 기준이에요. 이번엔 {res.hits}발, 평균 {res.avg ? res.avg.toFixed(1) : '-'}초였어요.</p></div></div>}
          </div>
        )}

        {isStreak ? <StreakDetail d={d} /> : <RangeDetail res={res} />}

        <div className="actions">
          <button className="btn primary" onClick={() => share(isStreak
            ? `🎯 사로 연속사격 ${res.streak}연속 명중 (${res.stage}단계)`
            : `🎯 사로 ${d.kind === 'daily' ? '오늘의 사격' : '측정사격'} ${res.hits}/20 · ${g} · ${fmt(res.score)}점`)}>결과 공유</button>
          <div className="two">
            <button className="btn gray" onClick={again}>{againLabel}</button>
            <button className="btn gray" onClick={() => go('ranking')}>랭킹 보기</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RangeDetail({ res }: { res: EngineResult }) {
  const misses = res.marks.filter(m => !m.hit);
  let tip: JSX.Element = <>가슴 중앙 근처에 잘 모였어요.</>;
  if (misses.length >= 2) {
    const mx = misses.reduce((a, m) => a + m.u, 0) / misses.length, my = misses.reduce((a, m) => a + m.v, 0) / misses.length;
    const side = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? '오른쪽' : '왼쪽') : (my > 0 ? '아래' : '위');
    tip = <>빗나간 {misses.length}발이 주로 <b className="warm">{side}</b>으로 갔어요.<small>계속 같은 쪽이면 영점을 반대쪽으로 1클릭 옮겨 보세요.</small></>;
  } else if (misses.length === 1) tip = <>한 발만 빗나갔어요.<small>표적이 내려가기 직전에 서두르지 않았는지 확인해 보세요.</small></>;
  return <>
    <div className="block"><div className="bh"><h2>탄착 분포</h2></div><div className="spread"><Silhouette marks={res.marks} /><p>{tip}</p></div></div>
    <div className="block">
      <div className="bh"><h2>거리별 명중</h2></div>
      {[100, 150, 200, 250].map(dd => {
        const s = res.stats[dd] || { shown: 0, hit: 0 };
        return <div key={dd} className="distrow"><span className="d">{dd}m</span><span className="tr"><i style={{ width: (s.shown ? s.hit / s.shown * 100 : 0) + '%' }} /></span><span className="n">{s.hit}/{s.shown}</span></div>;
      })}
    </div>
  </>;
}

function StreakDetail({ d }: { d: ResultData }) {
  const n = d.res.streak, info = d.res.info || {};
  const stages = [100, 150, 200, 250].map((dist, i) => {
    const reached = n >= i * 10;
    const end = reached && (i === 3 || n < (i + 1) * 10);
    const got = i === 3 ? n - 30 : Math.max(0, Math.min(10, n - i * 10));
    return <div key={i} className={end ? 'end' : reached ? '' : 'off'}><span>{i + 1}단계</span><b>{i === 3 ? '250m~' : dist + 'm'}</b><span>{end ? `${got}발 후 끝` : reached ? '10/10' : '-'}</span></div>;
  });
  let why: JSX.Element, adv: string;
  if (d.res.reason === 'timeout') {
    why = <div><span>끝난 이유</span><b className="bad">시간 안에 못 쐈어요</b></div>;
    adv = '표적이 올라오면 2초 안에 숨을 참기 시작해 보세요.';
  } else {
    const held = info.held || 0, dx = info.dx || 0, dy = info.dy || 0;
    const dirs = [Math.abs(dx) > 0.3 ? (dx > 0 ? '오른쪽' : '왼쪽') : '', Math.abs(dy) > 0.3 ? (dy > 0 ? '아래' : '위') : ''].filter(Boolean).join(' ');
    why = <>
      <div><span>빗나간 방향</span><b>{dirs || '가장자리'}로 {Math.hypot(dx, dy).toFixed(1)} mrad</b></div>
      <div><span>숨 참은 시간</span><b className={held > 3 || held < 1 ? 'bad' : ''}>{held.toFixed(1)}초{held > 3 ? ' · 안정 구간 넘김' : held < 1 ? ' · 안정 전' : ''}</b></div>
    </>;
    adv = held > 3 ? '숨을 3초 넘게 참아 흔들림이 다시 커진 순간에 쐈어요. 1~3초 사이에 떼는 연습을 해보세요.'
      : held < 1 ? '숨이 안정되기 전에 쐈어요. 1초쯤 참았다가 떼 보세요.'
        : '흔들림은 작았어요. 같은 쪽으로 자주 빗나가면 영점을 다시 잡아 보세요.';
  }
  const marks: Mark[] = info.dx != null && info.d ? [{ u: info.dx / (1000 / info.d), v: (info.dy || 0) / (1000 / info.d), hit: 0 }] : [];
  return <>
    <div className="block"><div className="bh"><h2>단계별 기록</h2></div><div className="stages">{stages}</div></div>
    <div className="block">
      <div className="bh"><h2>{info.n || n + 1}번째 발에서 끝났어요</h2></div>
      <div className="endbox"><Silhouette marks={marks} w={96} h={140} /><div className="kv">{why}</div></div>
      <p className="muted">{adv}</p>
    </div>
  </>;
}
