import { useState } from 'react';
import { RANKS, fmt, grade, kstWeek, rankOf } from '../lib/data';
import type { LocalProfile } from '../lib/store';
import type { AuthState, Provider } from '../lib/api';
import { Ins, TabBar, type Screen } from '../components/ui';

const MODE_NAME: Record<string, string> = { normal: '일반 사격', daily: '오늘의 사격', streak: '연속사격', exam1: '특등사수 시험' };

const PROVIDER_NAME: Record<string, string> = { kakao: '카카오', google: 'Google' };

interface Props {
  p: LocalProfile; online: boolean; go: (s: Screen) => void;
  auth: AuthState; providers: Provider[]; onLink: (p: Provider) => void; onLogout: () => void;
  saveNickname: (n: string) => Promise<boolean>; reset: () => void; focusName?: boolean;
}

export default function Records({ p, online, go, saveNickname, reset, focusName, auth, providers, onLink, onLogout }: Props) {
  const [name, setName] = useState(p.nickname || '');
  const [busy, setBusy] = useState(false);
  const me = rankOf(p.xp).name;
  return (
    <section className="screen light on">
      <div className="scroll">
        <header className="topbar"><h1>내 정보</h1></header>
        {online && (
          <div className="block">
            <div className="bh"><h2>계정</h2>{auth.kind === 'member' && <button className="textbtn sm" onClick={onLogout}>로그아웃</button>}</div>
            {auth.kind === 'member' ? (
              <p className="muted">{PROVIDER_NAME[auth.provider || ''] || auth.provider} 계정으로 로그인했어요. 다른 기기에서 같은 계정으로 로그인하면 계급이 이어져요.</p>
            ) : <>
              <div className="note bad flat">게스트 계정이에요. 앱 데이터를 지우거나 기기를 바꾸면 계급이 사라져요.</div>
              {providers.includes('kakao') && <button className="btn kakao" onClick={() => onLink('kakao')}>카카오 계정 연결</button>}
              {providers.includes('google') && <button className="btn google" onClick={() => onLink('google')}>Google 계정 연결</button>}
              {providers.length > 0
                ? <span className="muted xs">연결해도 지금 계급과 기록은 그대로예요.</span>
                : <span className="muted xs">계정 연결은 준비 중이에요. 열리면 지금 계급과 기록을 그대로 옮길 수 있어요.</span>}
            </>}
          </div>
        )}
        {online ? (
          <form className="block" onSubmit={async e => { e.preventDefault(); setBusy(true); await saveNickname(name); setBusy(false); }}>
            <label className="lbl" htmlFor="nick">랭킹에 보일 닉네임</label>
            <div className="inrow">
              <input id="nick" className="inp" value={name} autoFocus={focusName} maxLength={12} onChange={e => setName(e.target.value)} placeholder="한글·영문·숫자 2~12자" />
              <button className="btn primary sm" disabled={busy || name === p.nickname}>저장</button>
            </div>
            <span className="muted xs">다른 사람과 겹치지 않는 한글·영문·숫자 2~12자예요. 실제 부대명은 쓰지 마세요.</span>
          </form>
        ) : <div className="note">지금은 서버 없이 이 기기에만 저장돼요.</div>}
        <div className="block">
          <div className="stats3">
            <div><span>측정사격 최고</span><b className="num">{p.bestRange >= 0 ? p.bestRange + '/20' : '-'}</b></div>
            <div><span>연속사격 최고</span><b className="num">{p.bestStreak ? p.bestStreak + '연속' : '-'}</b></div>
            <div><span>이번 주 연속</span><b className="num">{p.weekStreak.week === kstWeek() && p.weekStreak.best ? p.weekStreak.best + '연속' : '-'}</b></div>
          </div>
        </div>
        <div className="block">
          <div className="bh"><h2>최근 사격</h2><span className="muted xs">이 기기 기준</span></div>
          {p.history.length ? p.history.slice(0, 15).map(h => {
            const d = new Date(h.t);
            const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const av = h.avg ? `평균 ${h.avg}초` : '명중 없음';
            return (
              <div className="hrow" key={h.t}>
                <div className="g"><b>{MODE_NAME[h.mode]}</b><span>{when} · {h.mode === 'streak' ? av : `${grade(h.hits)} · ${fmt(h.score)}점 · ${av}`}</span></div>
                <span className="v">{h.mode === 'streak' ? h.hits + '연속' : h.hits + '/20'}</span>
              </div>
            );
          }) : <p className="empty">아직 기록이 없어요. 첫 판을 쏴 보세요.</p>}
        </div>
        <div className="block">
          <div className="bh"><h2>계급표</h2></div>
          <div className="ranktable">
            {RANKS.map(([n, x]) => <div key={n} className={n === me ? 'me' : ''}><Ins rank={n} /><b>{n}</b><span>{fmt(x)}</span></div>)}
          </div>
        </div>
        {!online && <button className="textbtn danger" onClick={() => { if (confirm('이 기기에 저장된 계급·기록을 모두 지울까요?')) reset(); }}>기록 모두 지우기</button>}
      </div>
      <TabBar active="records" go={go} />
    </section>
  );
}
