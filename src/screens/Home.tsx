import { DAILY_LIMIT, EXAMS, fmt, rankIndex, rankOf } from '../lib/data';
import type { LocalProfile } from '../lib/store';
import { Chevron, Ins, Sym, TabBar, type Screen } from '../components/ui';
import type { Kind } from '../App';

interface Props {
  p: LocalProfile;
  online: boolean;
  guest: boolean;
  go: (s: Screen) => void;
  play: (k: Kind, o?: { rezero?: boolean }) => void;
}

export default function Home({ p, online, guest, go, play }: Props) {
  const r = rankOf(p.xp);
  const pct = r.next ? (p.xp - r.base) / (r.next.xp - r.base) * 100 : 100;
  const next = EXAMS[p.exams];
  const examOk = next && rankOf(p.xp).index >= rankIndex(next.need);
  const left = Math.max(0, DAILY_LIMIT - p.daily.used);

  return (
    <section className="screen light on">
      <div className="scroll">
        <header className="topbar">
          <div className="brand"><Sym /><span className="word">사로<i>.</i></span></div>
          {!online && <span className="tag gray">오프라인</span>}
        </header>
        {guest && (
          <button className="note action" onClick={() => go('records')}>게스트로 쏘는 중이에요. 계정을 연결하면 계급이 사라지지 않아요 ›</button>
        )}
        <div className="block">
          <div className="rankcard">
            <div className="rc-top">
              <Ins rank={r.name} />
              <div className="rc-name"><span>현재 계급</span><b>{r.name}</b></div>
              {p.exams > 0 && <span className="pill">{EXAMS[p.exams - 1].name}</span>}
            </div>
            <div className="xpbar"><span style={{ width: pct.toFixed(1) + '%' }} /></div>
            <div className="rc-foot">
              <b className="num">{r.next ? `${fmt(p.xp)} / ${fmt(r.next.xp)} XP` : `${fmt(p.xp)} XP`}</b>
              <span>{r.next ? `${r.next.name}까지 ${fmt(r.next.xp - p.xp)}` : '최고 계급'}</span>
            </div>
          </div>
          <button className="linkrow" onClick={() => go('exam')}>
            <span className={'disc badge-' + (next ? next.id : 5)}>{next ? next.id : 5}</span>
            <span className="lr-g">
              <b>{next ? next.name + ' 자격시험' : '모든 시험 통과'}</b>
              <span>{!next ? '전설의 저격수' : !next.ready ? '준비 중인 시험이에요' : examOk ? '도전할 수 있어요' : next.need + '이 되면 열려요'}</span>
            </span>
            <Chevron />
          </button>
        </div>

        <div className="block">
          <div className="bh"><h2>오늘의 사격</h2><span className="tag warm">첫 판 경험치 2배</span></div>
          <p className="muted">모두 같은 영점 오차, 같은 표적 순서로 쏴요. 하루 {DAILY_LIMIT}번까지, 랭킹엔 그날 최고 기록이 올라가요.</p>
          <div className="tries" aria-label={`오늘 ${p.daily.used}번 쐈어요`}>
            {Array.from({ length: DAILY_LIMIT }, (_, i) => <i key={i} className={i < p.daily.used ? 'used' : ''} />)}
            <span>{left > 0 ? `오늘 ${left}번 남았어요` : '오늘 기회를 다 썼어요'}{p.daily.best >= 0 ? ` · 오늘 최고 ${p.daily.best}/20` : ''}</span>
          </div>
          <button className="btn primary" disabled={left === 0} onClick={() => play('daily')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2 L12 7 L3 12 Z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            <span>{left === 0 ? '내일 다시 열려요' : p.daily.used ? `오늘의 사격 ${p.daily.used + 1}번째` : '오늘의 사격 시작하기'}</span>
          </button>
          <div className="two">
            <button className="tile" onClick={() => play('normal')}><b>일반 사격</b><span>{p.zero ? '저장된 영점으로 바로' : '영점부터 잡고 시작'}</span></button>
            <button className="tile" onClick={() => play('streak')}><b>연속사격</b><span>빗나가면 끝 · 주간 랭킹</span></button>
          </div>
          {p.zero && <button className="textbtn" onClick={() => play('normal', { rezero: true })}>영점 다시 잡고 일반 사격</button>}
        </div>

        <div className="block">
          <div className="bh"><h2>내 기록</h2><button className="textbtn sm" onClick={() => go('ranking')}>랭킹 보기</button></div>
          <div className="stats3">
            <div><span>측정사격 최고</span><b className="num">{p.bestRange >= 0 ? p.bestRange + '/20' : '-'}</b></div>
            <div><span>연속사격 최고</span><b className="num">{p.bestStreak ? p.bestStreak + '연속' : '-'}</b></div>
            <div><span>오늘의 사격</span><b className="num">{p.daily.best >= 0 ? p.daily.best + '/20' : '-'}</b></div>
          </div>
        </div>
      </div>
      <TabBar active="home" go={go} />
    </section>
  );
}
