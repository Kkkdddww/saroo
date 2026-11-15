# 사로 — 측정사격 게임

가늠자로 영점을 잡고, 실제 거리 비율로 작아지는 표적 20개를 맞히는 모바일 웹 사격 게임.
Vite + React + TypeScript, 서버는 Supabase, 배포는 GitHub Pages(Actions).

## 1. 내 컴퓨터에서 실행

```bash
npm install
cp .env.example .env      # Supabase 키를 넣는다. 비워 두면 서버 없이(기기 저장만) 돈다
npm run dev               # http://localhost:5173
```

`npm run build` 는 타입 검사 후 `dist/` 를 만든다.

## 2. Supabase 설정 (한 번만)

1. [supabase.com](https://supabase.com) 에서 새 프로젝트를 만든다. 지역은 Seoul(ap-northeast-2).
2. 아래 "로그인" 절에 따라 카카오·Google·게스트 로그인을 켠다.
3. **SQL Editor** 에 `supabase/migrations/0001_init.sql` 을 통째로 붙여 넣고 Run.
4. **Project Settings → API** 에서 `Project URL`, `anon public` 키를 복사해 `.env` 에 넣는다.

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

anon 키는 브라우저에 공개되는 키다. 권한은 SQL의 RLS·함수 권한으로 막혀 있다. `service_role` 키는 절대 넣지 않는다.

### 로그인 (온보딩 화면)

첫 화면에서 소개 3장 → 로그인 → 닉네임 순서로 나온다. 로그인은 카카오, Google, 게스트(로그인 없이 둘러보기) 세 가지.
게스트는 익명 계정이라 앱 데이터를 지우면 계급이 사라진다. 내 정보에서 카카오·Google을 연결하면 같은 계정 id 그대로라 계급이 이어진다.

1. **Authentication → URL Configuration**
   - Site URL: 배포 주소 (`https://<사용자명>.github.io/<저장소명>/`)
   - Redirect URLs: 배포 주소와 `http://localhost:5173/` 둘 다 추가
2. **Authentication → Sign In / Providers**
   - Anonymous sign-ins 켜기 (게스트)
   - **Allow manual linking** 켜기 (게스트 → 카카오·Google 연결에 필요)
3. **카카오** ([developers.kakao.com](https://developers.kakao.com))
   - 애플리케이션 추가 → 앱 키의 **REST API 키**가 Client ID
   - 카카오 로그인 활성화, 보안 → **Client Secret** 생성·활성화
   - Redirect URI: `https://<프로젝트>.supabase.co/auth/v1/callback`
   - 동의항목: 닉네임·프로필 사진. 이메일(account_email)은 **비즈 앱**에서만 고를 수 있다
   - Supabase Kakao Provider에 Client ID·Secret 입력. 비즈 앱이 아니면 **Allow users without an email** 을 켠다
4. **Google** ([console.cloud.google.com](https://console.cloud.google.com))
   - OAuth 동의 화면 → OAuth 클라이언트 ID(웹 애플리케이션)
   - 승인된 리디렉션 URI: `https://<프로젝트>.supabase.co/auth/v1/callback`
   - Supabase Google Provider에 Client ID·Secret 입력
5. 켠 로그인만 버튼으로 보인다: `.env` 의 `VITE_AUTH_PROVIDERS=kakao,google` (배포할 때는 GitHub secret `VITE_AUTH_PROVIDERS` 에 같은 값을 넣고 다시 배포). 비워 두면 소셜 로그인 버튼 없이 게스트로만 시작한다

## 3. GitHub Pages 배포

1. 새 저장소를 만들고 이 폴더를 그대로 올린다 (`node_modules`, `dist`, `.env` 는 `.gitignore` 로 빠진다).
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret** 에
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 두 개를 넣는다.
3. **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꾼다.
4. `main` 에 push 하면 `.github/workflows/deploy.yml` 이 빌드해서 배포한다.
   주소: `https://<사용자명>.github.io/<저장소명>/`
5. Supabase **Authentication → URL Configuration → Site URL** 에 위 주소를 넣는다.

## 4. 규칙 요약

| 모드 | 하루/주 | 랭킹 | 경험치 |
| --- | --- | --- | --- |
| 오늘의 사격 | 하루 3번 (시작하면 1번 차감) | 오늘 최고 기록 1개, 자정(KST) 초기화 | 그날 첫 판만 2배 |
| 연속사격 | 무제한 | 이번 주 최고 연속 명중, 월요일 0시(KST) 초기화 | 명중 1발 10, 한 판 최대 300 |
| 일반 사격 | 무제한 | 이번 주 최고 기록 | 기본 |
| 특등사수 시험 | 하루 3번, 상병부터 | 없음 (합격하면 휘장) | 기본 |
| 계급 | — | 누적 경험치 | — |

동점은 명중 수 → 종합 점수 → 평균 사격 시간 → 먼저 제출한 사람 순.
랭킹 점검 내용은 [RANKING.md](RANKING.md).

## 5. 구조

```
src/
  App.tsx                 로그인·온보딩, 화면 전환, 판 시작·제출, 경험치·진급
  screens/                온보딩 · 홈 · 랭킹 · 시험 · 내 정보 · 사격 · 결과
  game/engine.js          사격 엔진 (캔버스, 흔들림·숨·반동·탄착 판정). 타입은 engine.d.ts
  lib/api.ts              Supabase 호출 (카카오·Google·게스트 로그인, 계정 연결, RPC)
  lib/data.ts             계급표, 등급, 점수, KST 날짜, 시드 난수
  lib/store.ts            기기 저장 (영점, 최근 기록, 오프라인용)
  lib/insignia.ts         계급장 SVG
supabase/migrations/0001_init.sql   테이블, RLS, 서버 함수, 랭킹
.github/workflows/deploy.yml        GitHub Pages 배포
```

조작: 휴대폰은 화면 드래그로 조준하고 격발 버튼을 누르고 있으면 숨 참기, 떼면 발사. PC는 마우스 조준, 클릭·스페이스.
점검용으로 주소 끝에 `#debug` 를 붙이면 `window.__saro` 로 엔진 상태가 열린다.
