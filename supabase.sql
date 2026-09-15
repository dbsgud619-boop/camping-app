-- ============================================================
--  캠핑 준비 : 함께 쓰기 (방 코드 방식)
--  Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 하세요.
--  두 번 실행해도 안전합니다.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 방 하나 = 줄 하나. 기록 전체를 data(jsonb) 에 담습니다.
-- 방 코드는 저장하지 않고, 코드의 해시만 둡니다.
-- ------------------------------------------------------------
create table if not exists public.camp_rooms (
  code_hash   text primary key,
  data        jsonb       not null default '{}'::jsonb,
  rev         bigint      not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 테이블에는 아무도 직접 손대지 못하게 막습니다.
-- (정책을 하나도 만들지 않으면 전부 거부됩니다)
alter table public.camp_rooms enable row level security;
revoke all on public.camp_rooms from anon, authenticated;

-- ------------------------------------------------------------
-- 드나드는 길은 아래 함수 셋뿐입니다.
-- security definer 라서 방 코드 해시를 아는 경우에만 통과합니다.
-- ------------------------------------------------------------

-- 방 만들기
create or replace function public.camp_create_room(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_code_hash is null or length(p_code_hash) <> 64 then
    raise exception '방 코드가 올바르지 않습니다';
  end if;

  insert into public.camp_rooms (code_hash)
  values (p_code_hash)
  on conflict (code_hash) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- 방 내용 가져오기
create or replace function public.camp_pull(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.camp_rooms%rowtype;
begin
  if p_code_hash is null or length(p_code_hash) <> 64 then
    raise exception '방 코드가 올바르지 않습니다';
  end if;

  select * into r from public.camp_rooms where code_hash = p_code_hash;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object('found', true, 'data', r.data, 'rev', r.rev);
end;
$$;

-- 방 내용 올리기 (그 사이 남이 고쳤으면 ok=false 로 돌려보냅니다)
create or replace function public.camp_push(
  p_code_hash text,
  p_data      jsonb,
  p_base_rev  bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.camp_rooms%rowtype;
begin
  if p_code_hash is null or length(p_code_hash) <> 64 then
    raise exception '방 코드가 올바르지 않습니다';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception '보낸 내용이 올바르지 않습니다';
  end if;
  if pg_column_size(p_data) > 2 * 1024 * 1024 then
    raise exception '내용이 너무 큽니다';
  end if;

  select * into r from public.camp_rooms
    where code_hash = p_code_hash
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-room');
  end if;

  if r.rev <> p_base_rev then
    -- 다른 사람이 먼저 올렸습니다. 최신 내용을 돌려주면 앱이 다시 합칩니다.
    return jsonb_build_object('ok', false, 'reason', 'stale', 'data', r.data, 'rev', r.rev);
  end if;

  update public.camp_rooms
     set data = p_data,
         rev = r.rev + 1,
         updated_at = now()
   where code_hash = p_code_hash;

  return jsonb_build_object('ok', true, 'rev', r.rev + 1);
end;
$$;

-- 앱(anon 키)이 이 함수들만 쓸 수 있게 합니다.
revoke all on function public.camp_create_room(text) from public;
revoke all on function public.camp_pull(text) from public;
revoke all on function public.camp_push(text, jsonb, bigint) from public;

grant execute on function public.camp_create_room(text) to anon, authenticated;
grant execute on function public.camp_pull(text)        to anon, authenticated;
grant execute on function public.camp_push(text, jsonb, bigint) to anon, authenticated;
