import { useEffect, useRef } from 'react';
import { createEngine, type EngineConfig } from '../game/engine';

/** 사격 화면. HUD 요소는 엔진이 id로 찾아 매 프레임 직접 갱신한다 (React 렌더 없이 60fps). */
export default function GameScreen({ cfg }: { cfg: EngineConfig }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const engine = createEngine(root.current!);
    engine.ensureAudio();
    engine.start(cfg);
    return () => engine.destroy();
  }, [cfg]);

  return (
    <section className="screen dark on" id="sGame" ref={root}>
      <canvas id="gc" />
      <div id="hud">
        <div className="h-top">
          <button className="iconbtn glass" id="quitBtn" aria-label="그만두기">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4 L14 14 M14 4 L4 14" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          <div className="h-title"><span id="hudSub" /><b id="hudTitle" /></div>
          <div className="h-count num" id="hudCount" />
        </div>
        <div className="h-row range-only">
          <div className="dots" id="hudDots" />
          <span className="h-info" id="hudInfo" />
        </div>
        <div className="h-streak streak-only">
          <div className="sn"><b className="num" id="streakN">0</b><span>연속</span></div>
          <div className="sstage"><span id="streakStage">1단계</span><span className="seg" id="streakSeg" /></div>
        </div>
        <div className="chips" id="hudChips" />
        <div id="breathLbl" />
        <div id="hudMsg" />
        <div id="desktopTip">마우스로 조준 · 클릭이나 스페이스를 누르고 있으면 숨 참기 · 떼면 발사</div>
      </div>
      <div id="fireWrap">
        <button id="fire" aria-label="누르고 있으면 숨 참기, 떼면 발사"><span><i className="sym" aria-hidden="true" /></span></button>
        <small>누르면 숨 참기 · 떼면 발사</small>
      </div>
      <div id="zeroPanel">
        <span className="zp-k" id="zeroRound">1조 결과</span>
        <b className="zp-t" id="zeroTitle" />
        <span className="zp-c" id="clickInfo">아직 조정 안 함</span>
        <div className="pad">
          <span /><button data-d="u" aria-label="위로 1클릭">▲</button><span />
          <button data-d="l" aria-label="왼쪽으로 1클릭">◀</button><button data-d="d" aria-label="아래로 1클릭">▼</button><button data-d="r" aria-label="오른쪽으로 1클릭">▶</button>
        </div>
        <span className="zp-h">가늠자를 옮긴 쪽으로 탄착점이 따라와요. 빨간 표시를 가운데로 옮기세요.</span>
        <div className="two">
          <button className="btn ghost" id="reBtn">다시 3발</button>
          <button className="btn primary" id="rangeBtn">측정사격 시작</button>
        </div>
      </div>
    </section>
  );
}
