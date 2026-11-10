// 検索の流れ：Supabase で探し、なければ Overpass に直接問い合わせる
import { isValidQuery, looseKey, normalizeQuery } from "./normalize";
import { fetchShops as fetchShopsDefault, MAX_SHOPS, OverpassBusyError, toRawShop } from "./overpass";
import { countByPrefecture, findPrefecture } from "./prefecture";
import type { ShopStore } from "./shopStore";
import type { SearchResult, Shop } from "./types";

export type SearchDeps = {
  store: ShopStore | null;
  fetchShops: typeof fetchShopsDefault;
  /** レスポンスを返した後も続けたい処理（Vercel では waitUntil） */
  background: (p: Promise<unknown>) => void;
};

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
    const live = await deps.fetchShops(query);
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
