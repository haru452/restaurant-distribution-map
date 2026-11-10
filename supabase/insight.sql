-- 分布の考察（Gemini）用。Supabase の SQL Editor で1回実行する（schema.sql の後）

-- 店名ごとの考察の保存（30日以内ならこれを返す）
create table if not exists insights (
  query       text primary key,              -- normalizeQuery 後の店名
  insight     jsonb not null,
  created_at  timestamptz not null default now()
);
alter table insights enable row level security;

-- Gemini の1日の利用回数（日本時間の日付ごと）
create table if not exists gemini_usage (
  day    date primary key,
  count  integer not null default 0
);
alter table gemini_usage enable row level security;

-- 今日の回数を1つ増やし、上限以内なら true を返す（同時に呼ばれても正しく数える）
create or replace function use_gemini(daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  insert into gemini_usage as u (day, count)
  values ((now() at time zone 'Asia/Tokyo')::date, 1)
  on conflict (day) do update set count = u.count + 1
  returning u.count into used;
  return used <= daily_limit;
end;
$$;

-- service role 以外からは呼べないようにする
revoke execute on function use_gemini(integer) from public, anon, authenticated;
