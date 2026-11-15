import { EXAMS, EXAM_LIMIT, kstDay, rankIndex, rankOf } from '../lib/data';
import type { LocalProfile } from '../lib/store';
import { TabBar, type Screen } from '../components/ui';
import type { Kind } from '../App';

export default function Exam({ p, go, play }: { p: LocalProfile; go: (s: Screen) => void; play: (k: Kind) => void }) {
  const r = rankOf(p.xp);
  const left = p.examTries.day === kstDay() ? Math.max(0, EXAM_LIMIT - p.examTries.n) : EXAM_LIMIT;
  return (
    <section className="screen light on">
      <div className="scroll">
        <header className="topbar"><h1>저격수 자격시험</h1></header>
        <p className="muted pad">계급은 오래 하면 오르지만, 휘장은 시험을 통과해야만 받아요. 하루 {EXAM_LIMIT}번까지 도전할 수 있고, 떨어져도 경험치는 깎이지 않아요.</p>
        {EXAMS.map(e => {
          const passed = p.exams >= e.id;
          const rankOk = r.index >= rankIndex(e.need);
          const prevOk = p.exams >= e.id - 1;
          const can = e.ready && rankOk && prevOk && !passed && left > 0;
          const state = passed ? '합격' : !e.ready ? '준비 중' : !rankOk ? e.need + '부터' : !prevOk ? '이전 단계 먼저' : `오늘 ${left}번 남음`;
          return (
            <div key={e.id} className={'exam' + ((!e.ready || !rankOk) && !passed ? ' locked' : '')}>
              <div className="eh"><span className={'disc badge-' + e.id}>{e.id}</span><div className="g"><b>{e.name}</b><span>{state}</span></div></div>
              <ul>
                <li><i className={rankOk ? 'ok' : ''}>{rankOk ? '✓' : ''}</i><span>계급 {e.need} 이상</span></li>
                <li><i className={passed ? 'ok' : ''}>{passed ? '✓' : ''}</i><span>{e.desc} · 맞힐 곳: {e.zone}</span></li>
                <li><i /><span>해금: {e.reward}</span></li>
              </ul>
              {e.ready && !passed && <button className="btn primary" disabled={!can} onClick={() => play('exam1')}>시험 도전하기</button>}
            </div>
          );
        })}
      </div>
      <TabBar active="exam" go={go} />
    </section>
  );
}
