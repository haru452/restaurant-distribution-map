-- Supabase の SQL Editor で1回実行する
create extension if not exists pg_trgm;

create table if not exists shops (
  osm_id      text primary key,              -- 例 "node/123"、"way/456"
  name        text not null,
  brand       text,
  lat         double precision not null,
  lon         double precision not null,
  address     text,
  prefecture  text not null,
  search_key  text not null,                 -- 名前タグの looseKey を "|" でつないだもの
  updated_at  timestamptz not null default now()
);

-- 部分一致（like '%…%'）を速くする索引
create index if not exists shops_search_key_trgm on shops using gin (search_key gin_trgm_ops);
create index if not exists shops_updated_at on shops (updated_at);

-- ポリシーは作らない＝service role キー以外からは読み書きできない
alter table shops enable row level security;

-- 分布の考察（Gemini）用の表は supabase/insight.sql を参照
