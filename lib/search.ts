// 検索の流れ：Supabase で探し、なければ Overpass に直接問い合わせる
import { isValidQuery, looseKey, normalizeQuery } from "./normalize";
import { fetchShops as fetchShopsDefault, MAX_SHOPS, OverpassBusyError, toRawShop } from "./overpass";
import { countByPrefecture, findPrefecture } from "./prefecture";
import type { Company } from "./companies";
import type { ShopStore } from "./shopStore";
import type { SearchResult, Shop } from "./types";

export type SearchDeps = {
  store: ShopStore | null;
  fetchShops: typeof fetchShopsDefault;
  /** レスポンスを返した後も続けたい処理（Vercel では waitUntil） */
  background: (p: Promise<unknown>) => void;
  /** 検索語が会社名なら、その会社（例：すかいらーく → ガスト・バーミヤン…） */
  findCompany?: (normalized: string) => Company | null;
  /** 現在時刻（ミリ秒）。テスト用 */
  now?: () => number;
};

/** Vercel の60秒制限の中で、Overpass に使ってよい時間の上限（検索開始から数える） */
export const SEARCH_BUDGET_MS = 50_000;
/** 残りがこれより少なければ Overpass を呼ばない */
const MIN_OVERPASS_MS = 5_000;

export type SearchResponse = {
  status: number;
  body: SearchResult | { error: string };
  cacheable: boolean;
};

function result(query: string, shops: Shop[], truncated: boolean, source: SearchResult["source"]): SearchResponse {
  return {
    status: 200,
    cacheable: true,
    body: { query, total: shops.length, truncated, source, shops, byPrefecture: countByPrefecture(shops) },
  };
}

export async function handleSearch(rawQuery: string | null, deps: SearchDeps): Promise<SearchResponse> {
  const query = normalizeQuery(rawQuery ?? "");
  if (!isValidQuery(query)) return { status: 400, body: { error: "invalid_query" }, cacheable: false };
  const now = deps.now ?? Date.now;
  const deadline = now() + SEARCH_BUDGET_MS;

  // 0. 会社名なら、その会社のチェーンをまとめて探す
  const company = deps.store ? deps.findCompany?.(query) : null;
  if (company && deps.store) {
    try {
      const found = await searchCompany(company, deps.store);
      if (found) return found(query);
    } catch (e) {
      console.warn("[search] 会社のまとめ検索に失敗したので、ふつうに探します:", (e as Error).message);
    }
  }

  // 1. Supabase
  if (deps.store) {
    try {
      const found = await deps.store.search(looseKey(query));
      if (found.length > 0) {
        const truncated = found.length > MAX_SHOPS;
        return result(query, found.slice(0, MAX_SHOPS), truncated, "db");
      }
    } catch (e) {
      console.warn("[search] Supabase を使えないので Overpass で続けます:", (e as Error).message);
    }
  }

  // 2. Overpass に直接
  try {
    const remaining = deadline - now();
    if (remaining < MIN_OVERPASS_MS) throw new OverpassBusyError("no time left");
    const live = await deps.fetchShops(query, undefined, remaining);
    const withPref = live.shops.map((s) => ({ ...s, prefecture: findPrefecture(s.lat, s.lon) }));
    if (withPref.length > 0 && deps.store) {
      const store = deps.store;
      deps.background(
        store.upsert(withPref).catch((e) => console.warn("[search] Supabase への保存に失敗:", (e as Error).message)),
      );
    }
    const shops = withPref.map((s) => ({ ...toRawShop(s), prefecture: s.prefecture }));
    return result(query, shops, live.truncated, "live");
  } catch (e) {
    if (e instanceof OverpassBusyError) return { status: 503, body: { error: "busy" }, cacheable: false };
    console.error("[search] 失敗:", e);
    return { status: 500, body: { error: "internal" }, cacheable: false };
  }
}

const MAX_COMPANY_BRANDS = 20;

/**
 * 会社のチェーンを並べて探し、同じ店は1回だけ数える。
 * 長い名前のチェーンから順に数えるので、「ステーキガスト」の店が「ガスト」に数えられない。
 * 1件もなければ null。
 */
async function searchCompany(company: Company, store: ShopStore) {
  const brands = company.brands.slice(0, MAX_COMPANY_BRANDS);
  const results = await Promise.all(brands.map((b) => store.search(looseKey(b))));
  const order = brands.map((b, i) => ({ b, i })).sort((x, y) => looseKey(y.b).length - looseKey(x.b).length);

  const seen = new Set<string>();
  const shops: Shop[] = [];
  const counts = new Map<string, number>();
  for (const { b, i } of order) {
    for (const shop of results[i]) {
      const key = `${shop.name}|${shop.lat}|${shop.lon}`;
      if (seen.has(key)) continue;
      seen.add(key);
      shops.push(shop);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
  }
  if (shops.length === 0) return null;

  const breakdown = [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
  return (query: string): SearchResponse => {
    const res = result(query, shops.slice(0, MAX_SHOPS), shops.length > MAX_SHOPS, "db");
    (res.body as SearchResult).company = { name: company.name, brands: breakdown };
    return res;
  };
}
