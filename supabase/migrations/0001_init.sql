-- 사로 — Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run.
-- 원칙: 브라우저는 "사격 기록(탄 하나하나)"만 보낸다. 명중 수·점수·경험치·시도 횟수는 서버가 계산하고 막는다.
--       날짜는 한국 시간(KST) 기준. 오늘의 사격은 하루 3회, 랭킹은 그날 최고 기록.

create extension if not exists pgcrypto;

-- ───────────────────────── 테이블 ─────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text unique check (char_length(nickname) between 2 and 12),
  xp          integer  not null default 0 check (xp >= 0),
  exams       smallint not null default 0,   -- 통과한 저격수 시험 단계 (0~5)
  best_range  smallint not null default -1,  -- 측정사격 최고 명중 수
  best_streak integer  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  mode         text not null check (mode in ('daily', 'normal', 'streak', 'exam1')),
  period       date not null,              -- daily·exam1: KST 날짜 / normal·streak: 그 주 월요일(KST)
  attempt      smallint not null default 1,
  seed         bigint not null,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  status       text not null default 'started' check (status in ('started', 'done')),
  hits         smallint,
  score        integer,
  avg_time     real,
  streak       integer,
  shots        jsonb,
  xp_gained    integer,
  passed       boolean
);
create index if not exists runs_board on public.runs (mode, period, status);
create index if not exists runs_user  on public.runs (user_id, mode, period);

-- ───────────────────────── 보안 (RLS) ─────────────────────────
-- 테이블에 직접 쓰기는 막고, 아래 함수(security definer)로만 기록한다.
alter table public.profiles enable row level security;
alter table public.runs     enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);

drop policy if exists "own runs" on public.runs;
create policy "own runs" on public.runs for select using (auth.uid() = user_id);

-- ───────────────────────── 날짜 (KST) ─────────────────────────
create or replace function public.kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function public.kst_week() returns date
language sql stable as $$ select date_trunc('week', now() at time zone 'Asia/Seoul')::date $$;

-- ───────────────────────── 프로필 ─────────────────────────
create or replace function public.ensure_profile() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  insert into profiles (id, nickname)
  values (uid, '사수' || upper(substr(replace(uid::text, '-', ''), 1, 6)))
  on conflict (id) do nothing;
  select * into p from profiles where id = uid;
  return p;
end $$;

create or replace function public.set_nickname(p_name text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(p_name); p profiles;
begin
  perform ensure_profile();
  if n !~ '^[가-힣A-Za-z0-9_]{2,12}$' then raise exception 'bad_nickname'; end if;
  if exists (select 1 from profiles where nickname = n and id <> uid) then raise exception 'nickname_taken'; end if;
  update profiles set nickname = n where id = uid returning * into p;
  return p;
end $$;

-- ───────────────────────── 판 시작 ─────────────────────────
-- 시작할 때 시도 횟수를 센다. 중간에 그만둬도 1회로 친다 (좋은 판이 나올 때까지 재시작하는 것을 막음).
create or replace function public.start_run(p_mode text) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d date := kst_today();
  w date := kst_week();
  per date; n int; s bigint; r runs; prof profiles;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_mode not in ('daily', 'normal', 'streak', 'exam1') then raise exception 'bad_mode'; end if;
  prof := ensure_profile();
  perform pg_advisory_xact_lock(hashtext(uid::text || p_mode));   -- 동시에 여러 번 눌러도 3회를 넘지 않게

  per := case when p_mode in ('daily', 'exam1') then d else w end;
  select count(*) into n from runs where user_id = uid and mode = p_mode and period = per;

  if p_mode = 'daily' and n >= 3 then raise exception 'daily_limit'; end if;
  if p_mode = 'exam1' then
    if prof.xp < 3000 then raise exception 'rank_too_low'; end if;       -- 상병부터
    if prof.exams >= 1 then raise exception 'already_passed'; end if;
    if n >= 3 then raise exception 'exam_limit'; end if;
  end if;

  s := case p_mode
         when 'daily'  then to_char(d, 'YYYYMMDD')::bigint                 -- 오늘은 모두 같은 조건 (3회 모두 같은 시드)
         when 'streak' then to_char(w, 'YYYYMMDD')::bigint + 77            -- 이번 주는 모두 같은 표적 순서
         when 'exam1'  then to_char(d, 'YYYYMMDD')::bigint * 7 + 11 + n
         else floor(random() * 1e9)::bigint
       end;

  insert into runs (user_id, mode, period, attempt, seed)
  values (uid, p_mode, per, n + 1, s) returning * into r;

  return json_build_object(
    'run_id', r.id, 'seed', r.seed, 'attempt', r.attempt, 'period', r.period,
    'limit', case when p_mode in ('daily', 'exam1') then 3 end);
end $$;

-- ───────────────────────── 판 제출 ─────────────────────────
-- p_shots: [{ "h":1|0, "d":100|150|200|250|0, "t":표적이 뜬 뒤 쏜 시각(초), "T":표적 노출 시간(초), "r":가슴 중앙에서 거리(표적 높이 절반=1) }]
create or replace function public.submit_run(p_run uuid, p_shots jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r runs; prof profiles;
  v_n int; v_hits int; v_first_miss int; v_score numeric; v_avg real; v_min_t real; v_bad int; v_h200 int; v_h250 int;
  elapsed real; v_xp int := 0; gb int := 0; is_best boolean := false; ok boolean := null; g text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into r from runs where id = p_run and user_id = uid for update;
  if not found then raise exception 'run_not_found'; end if;
  if r.status <> 'started' then raise exception 'run_already_submitted'; end if;
  if jsonb_typeof(p_shots) <> 'array' then raise exception 'bad_shots'; end if;

  elapsed := extract(epoch from now() - r.started_at);
  if elapsed > 1800 then raise exception 'run_expired'; end if;

  select count(*),
         count(*) filter (where (e->>'h')::int = 1),
         coalesce(sum(case when (e->>'h')::int = 1 then
           1000 + 300 * greatest(0, 1 - (e->>'t')::real / nullif((e->>'T')::real, 0))
                + 100 * greatest(0, 1 - least((e->>'r')::real, 1)) end), 0),
         avg((e->>'t')::real) filter (where (e->>'h')::int = 1),
         min((e->>'t')::real) filter (where (e->>'h')::int = 1),
         count(*) filter (where (e->>'h')::int = 1 and (
              (e->>'d')::int not in (100, 150, 200, 250)
           or (e->>'T')::real not between 3.4 and 8.6
           or (e->>'t')::real > (e->>'T')::real + 0.05
           or (e->>'r')::real < 0)),
         count(*) filter (where (e->>'h')::int = 1 and (e->>'d')::int = 200),
         count(*) filter (where (e->>'h')::int = 1 and (e->>'d')::int = 250)
    into v_n, v_hits, v_score, v_avg, v_min_t, v_bad, v_h200, v_h250
    from jsonb_array_elements(p_shots) e;

  -- 말이 안 되는 기록은 받지 않는다
  if v_bad > 0 then raise exception 'implausible_shot'; end if;
  if v_hits > 0 and v_min_t < 0.25 then raise exception 'implausible_reaction'; end if;
  if r.mode in ('daily', 'normal', 'exam1') then
    if v_n > 20 then raise exception 'too_many_shots'; end if;
    if elapsed < 25 then raise exception 'too_fast'; end if;              -- 표적 10번이 오르내리는 데만 25초 넘게 걸린다
  else
    -- 연속사격: 빗나간 탄은 마지막 한 발뿐이어야 한다
    select min(o) into v_first_miss from jsonb_array_elements(p_shots) with ordinality as x(e, o) where (e->>'h')::int = 0;
    if v_first_miss is not null and v_first_miss < v_n then raise exception 'streak_continues_after_miss'; end if;
    if elapsed < v_hits * 1.0 + 2 then raise exception 'too_fast'; end if;
  end if;

  prof := ensure_profile();

  if r.mode = 'streak' then
    v_xp := least(300, v_hits * 10);
    update profiles set xp = profiles.xp + v_xp, best_streak = greatest(profiles.best_streak, v_hits) where id = uid;
  else
    g := case when v_hits >= 18 then '특등사수' when v_hits >= 15 then '1급' when v_hits >= 12 then '2급' when v_hits >= 10 then '3급' else '불합격' end;
    gb := case g when '특등사수' then 200 when '1급' then 100 when '2급' then 50 else 0 end;
    is_best := prof.best_range >= 0 and v_hits > prof.best_range;
    v_xp := 100 + v_hits * 20 + v_h200 * 5 + v_h250 * 10 + gb + case when is_best then 100 else 0 end;
    -- 오늘의 사격 2배는 그날 처음 제출한 판에만 (3판 모두 2배면 하루 경험치가 너무 커진다)
    if r.mode = 'daily' and not exists (
         select 1 from runs x where x.user_id = uid and x.mode = 'daily' and x.period = r.period and x.status = 'done') then
      v_xp := v_xp * 2;
    end if;
    if r.mode = 'exam1' then ok := v_hits >= 18 and coalesce(v_avg, 99) <= 4; end if;
    update profiles
       set xp = profiles.xp + v_xp,
           best_range = greatest(profiles.best_range, v_hits),
           exams = case when ok then greatest(profiles.exams, 1) else profiles.exams end
     where id = uid;
  end if;

  update runs set status = 'done', submitted_at = now(), hits = v_hits, score = round(v_score),
                  avg_time = v_avg, streak = case when r.mode = 'streak' then v_hits end,
                  shots = p_shots, xp_gained = v_xp, passed = ok
   where id = r.id;

  select * into prof from profiles where id = uid;
  return json_build_object(
    'hits', v_hits, 'score', round(v_score), 'avg', v_avg, 'xp_gained', v_xp, 'xp_total', prof.xp,
    'is_best', is_best, 'passed', ok, 'attempt', r.attempt,
    'attempts_left', case when r.mode in ('daily', 'exam1') then greatest(0, 3 - r.attempt) end);
end $$;

-- ───────────────────────── 랭킹 ─────────────────────────
-- p_board: 'daily'(오늘의 사격, 오늘) · 'streak'(연속사격, 이번 주) · 'weekly'(일반 사격, 이번 주) · 'xp'(계급)
-- 한 사람은 기간 안의 최고 기록 하나로만 올라간다. 상위 p_limit 명 + 내 줄을 함께 돌려준다.
create or replace function public.leaderboard(p_board text, p_limit int default 50)
returns table (rank bigint, total bigint, user_id uuid, nickname text, xp int, exams smallint,
               hits int, score int, avg_time real, streak int, attempts int, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); per date; m text;
begin
  if p_board = 'xp' then
    return query
    with ranked as (
      select p.id, p.nickname, p.xp, p.exams,
             rank() over (order by p.xp desc) rk, count(*) over () tot
        from profiles p where p.xp > 0
    )
    select rk, tot, id, ranked.nickname, ranked.xp, ranked.exams, null::int, null::int, null::real, null::int, null::int, id = uid
      from ranked where rk <= p_limit or id = uid order by rk;
    return;
  end if;

  if p_board = 'daily' then m := 'daily'; per := kst_today();
  elsif p_board = 'streak' then m := 'streak'; per := kst_week();
  elsif p_board = 'weekly' then m := 'normal'; per := kst_week();
  else raise exception 'bad_board'; end if;

  return query
  with best as (
    select distinct on (r.user_id) r.user_id, r.hits, r.score, r.avg_time, r.streak, r.submitted_at,
           count(*) over (partition by r.user_id) att
      from runs r
     where r.mode = m and r.period = per and r.status = 'done'
     order by r.user_id,
              case when m = 'streak' then r.streak else r.hits end desc nulls last,
              r.score desc, r.avg_time asc nulls last, r.submitted_at asc
  ), ranked as (
    select b.*, rank() over (order by case when m = 'streak' then b.streak else b.hits end desc nulls last,
                                      b.score desc, b.avg_time asc nulls last) rk,
           count(*) over () tot
      from best b
  )
  select rk, tot, ranked.user_id, p.nickname, p.xp, p.exams, ranked.hits::int, ranked.score, ranked.avg_time, ranked.streak, ranked.att::int, ranked.user_id = uid
    from ranked join profiles p on p.id = ranked.user_id
   where rk <= p_limit or ranked.user_id = uid
   order by rk;
end $$;

-- 오늘 내 오늘의 사격 현황 (남은 횟수, 오늘 최고)
create or replace function public.my_today() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'day', kst_today(),
    'daily_used', (select count(*) from runs where user_id = auth.uid() and mode = 'daily' and period = kst_today()),
    'daily_best', (select max(hits) from runs where user_id = auth.uid() and mode = 'daily' and period = kst_today() and status = 'done'),
    'exam_used',  (select count(*) from runs where user_id = auth.uid() and mode = 'exam1' and period = kst_today()),
    'week_streak',(select max(streak) from runs where user_id = auth.uid() and mode = 'streak' and period = kst_week() and status = 'done'));
$$;

-- 함수 권한: 로그인(익명 포함)한 사용자만
revoke all on function public.ensure_profile()            from public, anon;
revoke all on function public.set_nickname(text)          from public, anon;
revoke all on function public.start_run(text)             from public, anon;
revoke all on function public.submit_run(uuid, jsonb)     from public, anon;
revoke all on function public.leaderboard(text, int)      from public, anon;
revoke all on function public.my_today()                  from public, anon;
grant execute on function public.ensure_profile()         to authenticated;
grant execute on function public.set_nickname(text)       to authenticated;
grant execute on function public.start_run(text)          to authenticated;
grant execute on function public.submit_run(uuid, jsonb)  to authenticated;
grant execute on function public.leaderboard(text, int)   to authenticated;
grant execute on function public.my_today()               to authenticated;
