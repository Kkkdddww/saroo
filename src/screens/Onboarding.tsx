import { useState } from 'react';
import type { Provider } from '../lib/api';
import { Ins, Sym } from '../components/ui';

export type OnboardStep = 'intro' | 'login' | 'nickname';

interface Props {
  step: OnboardStep;
  online: boolean;
  providers: Provider[];
  busy: boolean;
  setStep: (s: OnboardStep) => void;
  onProvider: (p: Provider) => void;
  onGuest: () => void;
  onOffline: () => void;
  onNickname: (name: string) => Promise<boolean>;
  onDone: () => void;
}

const SLIDES = [
  { k: 'aim', title: '가늠자로 영점을 잡고\n20발 중 몇 발?', body: '실제 거리 비율로 작아지는 100~250m 표적. 숨을 참고, 흔들림이 잦아드는 순간 떼세요.' },
  { k: 'rank', title: '쏠수록 진급해요', body: '이병에서 대장까지 19계급. 상병부터는 저격수 자격시험으로 휘장을 받아요.' },
  { k: 'board', title: '매일 같은 조건으로 겨뤄요', body: '오늘의 사격은 모두 같은 영점 오차와 표적 순서로 하루 3번. 그날 최고 기록이 랭킹에 올라가요.' },
];

function Art({ k }: { k: string }) {
  if (k === 'aim') return (
    <div className="ob-art aim" aria-hidden="true">
      <div className="ob-peep"><span className="ob-post" /><span className="ob-ear l" /><span className="ob-ear r" /><span className="ob-tgt" /></div>
    </div>
  );
  if (k === 'rank') return (
    <div className="ob-art rank" aria-hidden="true">
      {['이병', '상병', '하사', '소위', '대위', '대령', '대장'].map((r, i) => (
        <div key={r} className="ob-step" style={{ animationDelay: i * 0.12 + 's' }}><Ins rank={r} /><span>{r}</span></div>
      ))}
    </div>
  );
  return (
    <div className="ob-art board" aria-hidden="true">
      {[['1', '철책수호자', '20/20'], ['2', '백발백중', '19/20'], ['3', '나', '18/20']].map(([n, name, v]) => (
        <div key={n} className={'ob-row' + (name === '나' ? ' me' : '')}><b className="num">{n}</b><span>{name}</span><b className="num">{v}</b></div>
      ))}
    </div>
  );
}

const KakaoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3C5.6 3 2 5.8 2 9.2c0 2.2 1.5 4.1 3.7 5.2l-.9 3.3c-.1.3.2.5.5.3l3.9-2.6c.3 0 .5.1.8.1 4.4 0 8-2.8 8-6.3S14.4 3 10 3z" fill="#191919" /></svg>
);
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
);

export default function Onboarding(props: Props) {
  const { step, online, providers, busy } = props;
  const [i, setI] = useState(0);
  const [name, setName] = useState('');

  if (step === 'intro') {
    const s = SLIDES[i];
    const last = i === SLIDES.length - 1;
    return (
      <section className="screen ob on">
        <header className="ob-top">
          <div className="brand"><Sym /><span className="word">사로<i>.</i></span></div>
          <button className="textbtn sm" onClick={() => props.setStep('login')}>건너뛰기</button>
        </header>
        <div className="ob-body" key={i}>
          <Art k={s.k} />
          <h1 className="ob-title">{s.title}</h1>
          <p className="ob-text">{s.body}</p>
        </div>
        <div className="ob-foot">
          <div className="ob-dots" aria-label={`${SLIDES.length}장 중 ${i + 1}번째`}>
            {SLIDES.map((_, j) => <i key={j} className={j === i ? 'on' : ''} />)}
          </div>
          <button className="btn primary" onClick={() => (last ? props.setStep('login') : setI(i + 1))}>{last ? '시작하기' : '다음'}</button>
        </div>
      </section>
    );
  }

  if (step === 'login') {
    return (
      <section className="screen ob on">
        <header className="ob-top">
          <button className="textbtn sm" onClick={() => { setI(0); props.setStep('intro'); }}>‹ 소개 다시 보기</button>
        </header>
        <div className="ob-body left">
          <div className="ob-logo"><Sym size={44} /></div>
          <h1 className="ob-title">계급과 기록을<br />계정에 남겨요</h1>
          <p className="ob-text">로그인하면 휴대폰을 바꿔도 계급·휘장·랭킹 기록이 그대로 이어져요.</p>
        </div>
        <div className="ob-foot">
          {online ? <>
            {providers.includes('kakao') && (
              <button className="btn kakao" disabled={busy} onClick={() => props.onProvider('kakao')}><KakaoIcon />카카오로 시작하기</button>
            )}
            {providers.includes('google') && (
              <button className="btn google" disabled={busy} onClick={() => props.onProvider('google')}><GoogleIcon />Google로 계속하기</button>
            )}
            <button className="textbtn" disabled={busy} onClick={props.onGuest}>로그인 없이 둘러보기</button>
            <p className="ob-fine">게스트 기록은 이 기기에만 남아요. 나중에 내 정보에서 계정을 연결하면 계급이 그대로 이어져요.</p>
          </> : <>
            <button className="btn primary" onClick={props.onOffline}>시작하기</button>
            <p className="ob-fine">서버가 연결되지 않아 이 기기에만 저장돼요.</p>
          </>}
        </div>
      </section>
    );
  }

  return (
    <section className="screen ob on">
      <header className="ob-top" />
      <form className="ob-body left" onSubmit={async e => { e.preventDefault(); if (await props.onNickname(name)) props.onDone(); }}>
        <h1 className="ob-title">랭킹에 보일<br />이름을 정해요</h1>
        <p className="ob-text">한글·영문·숫자 2~12자. 실제 부대명이나 계급은 쓰지 마세요.</p>
        <label className="lbl" htmlFor="obnick">닉네임</label>
        <input id="obnick" className="inp" value={name} maxLength={12} autoFocus onChange={e => setName(e.target.value)} placeholder="예: 영점요정" />
        <button className="btn primary" disabled={busy || name.trim().length < 2}>이 이름으로 시작</button>
        <button type="button" className="textbtn" onClick={props.onDone}>나중에 정할게요</button>
      </form>
    </section>
  );
}
