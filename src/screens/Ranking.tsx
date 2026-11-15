import { useEffect, useState } from 'react';
import { api, type Board, type BoardRow } from '../lib/api';
import { EXAMS, fmt, rankOf } from '../lib/data';
import { Ins, TabBar, type Screen } from '../components/ui';

const BOARDS: { id: Board; label: string; desc: string }[] = [
  { id: 'daily', label: '오늘', desc: '오늘의 사격 · 한 사람당 오늘 최고 기록 · 자정(KST)에 바뀌어요' },
  { id: 'streak', label: '연속', desc: '연속사격 · 이번 주 최고 연속 명중 · 월요일에 바뀌어요' },
  { id: 'weekly', label: '주간', desc: '일반 사격 · 이번 주 최고 기록 · 월요일에 바뀌어요' },
  { id: 'xp', label: '계급', desc: '누적 경험치 · 오래, 잘 쏜 사람' },
];

interface Props { online: boolean; nickname: string | null; go: (s: Screen) => void; onRename: () => void }

export default function Ranking({ online, nickname, go, onRename }: Props) {
  const [board, setBoard] = useState<Board>('daily');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!online) return;
    let alive = true;
    setRows(null); setErr('');
    api.leaderboard(board, 50).then(r => { if (alive) setRows(r); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [board, online]);

  const me = rows?.find(r => r.is_me);
  const top = rows?.filter(r => r.rank <= 50) ?? [];
  const value = (r: BoardRow) => board === 'xp' ? <><b className="num">{fmt(r.xp)}</b><span>XP</span></>
    : board === 'streak' ? <><b className="num">{r.streak}연속</b><span>평균 {r.avg_time ? r.avg_time.toFixed(1) : '-'}초</span></>
      : <><b className="num">{r.hits}/20</b><span>{fmt(r.score || 0)}점</span></>;
  const sub = (r: BoardRow) => `${rankOf(r.xp).name}${r.exams ? ' · ' + EXAMS[r.exams - 1].name : ''}`;

  return (
    <section className="screen light on">
      <div className="scroll">
        <header className="topbar"><h1>랭킹</h1></header>
        <div className="seg4" role="tablist" aria-label="랭킹 종류">
          {BOARDS.map(b => <button key={b.id} role="tab" aria-selected={board === b.id} className={board === b.id ? 'on' : ''} onClick={() => setBoard(b.id)}>{b.label}</button>)}
        </div>
        <p className="muted pad tight">{BOARDS.find(b => b.id === board)!.desc}{rows && rows.length ? ` · ${fmt(rows[0].total)}명` : ''}</p>
        {!online && <div className="note">서버가 연결되지 않아 랭킹을 볼 수 없어요. .env 에 Supabase 키를 넣으면 열려요.</div>}
        {online && nickname?.startsWith('사수') && (
          <button className="note action" onClick={onRename}>지금 닉네임은 <b>{nickname}</b>이에요. 랭킹에 보일 이름을 정하세요 ›</button>
        )}
        {err && <div className="note bad">{err}</div>}
        {online && !rows && !err && <p className="empty pad">불러오는 중…</p>}
        {rows && rows.length === 0 && <p className="empty pad">아직 기록이 없어요. 첫 번째가 되어 보세요.</p>}
        <div className="lb">
          {top.map(r => (
            <div key={r.user_id} className={'lbrow' + (r.is_me ? ' me' : '')}>
              <span className={'no num' + (r.rank <= 3 ? ' top' + r.rank : '')}>{r.rank}</span>
              <Ins rank={rankOf(r.xp).name} className="sm" />
              <span className="g"><b>{r.nickname}</b><span>{sub(r)}</span></span>
              <span className="v">{value(r)}</span>
            </div>
          ))}
        </div>
      </div>
      {me && me.rank > 50 && (
        <div className="mebar">
          <span className="num">{fmt(me.rank)}</span>
          <span className="g"><b>나 · {rankOf(me.xp).name}</b><span>상위 {Math.max(1, Math.round(me.rank / me.total * 100))}%</span></span>
          <span className="v">{value(me)}</span>
        </div>
      )}
      <TabBar active="ranking" go={go} />
    </section>
  );
}
