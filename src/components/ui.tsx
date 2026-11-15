import { INSIGNIA } from '../lib/insignia';

export type Screen = 'home' | 'ranking' | 'exam' | 'records' | 'game' | 'result';

/** 계급장 (고정 SVG 문자열) */
export function Ins({ rank, className }: { rank: string; className?: string }) {
  return <span className={'ins ' + (className || '')} dangerouslySetInnerHTML={{ __html: INSIGNIA[rank] || '' }} />;
}

export function Sym({ size = 26 }: { size?: number }) {
  return <span className="sym" aria-hidden="true" style={{ width: size, height: size }} />;
}

const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M3.5 10 L11 4 L18.5 10 V18 H13.5 V13 H8.5 V18 H3.5 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
);
const RankIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M7 4 H15 V9 a4 4 0 0 1 -8 0 Z M7 6 H4 a3 3 0 0 0 3 4 M15 6 H18 a3 3 0 0 1 -3 4 M11 13 V16 M7.5 18 H14.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>
);
const ExamIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="11" cy="11" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="11" cy="11" r="1" fill="currentColor" /></svg>
);
const MeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4 18.5 a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

export function TabBar({ active, go }: { active: Screen; go: (s: Screen) => void }) {
  const tabs: [Screen, string, JSX.Element][] = [
    ['home', '홈', <HomeIcon key="h" />], ['ranking', '랭킹', <RankIcon key="r" />],
    ['exam', '시험', <ExamIcon key="e" />], ['records', '내 정보', <MeIcon key="m" />],
  ];
  return (
    <nav className="tabbar" aria-label="하단 탭">
      {tabs.map(([id, label, icon]) => (
        <button key={id} className={active === id ? 'on' : ''} onClick={() => go(id)} aria-current={active === id ? 'page' : undefined}>
          {icon}{label}
        </button>
      ))}
    </nav>
  );
}

export const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3 L11 8 L6 13" fill="none" stroke="#9AA0A6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 L6.5 10 L12.5 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
