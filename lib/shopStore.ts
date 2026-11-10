// Supabase の店テーブル（shops）の検索と書き込み。サーバー側だけで使う
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MAX_SHOPS } from "./overpass";
import type { OsmShop, Shop } from "./types";

export type ShopRow = {
  osm_id: string;
  name: string;
  brand: string | null;
  lat: number;
  lon: number;
  address: string | null;
  prefecture: string;
  search_key: string;
  updated_at?: string;
};

export type ShopStore = {
  /** search_key に key を含む店を最大 MAX_SHOPS+1 件 */
  search(key: string): Promise<Shop[]>;
  upsert(shops: (OsmShop & { prefecture: string })[], updatedAt?: Date): Promise<void>;
  /** updated_at が t より古い行を消し、消した件数を返す */
  deleteOlderThan(t: Date): Promise<number>;
  ping(): Promise<void>;
};

const TABLE = "shops";
const PAGE = 1000; // Supabase API の1回の上限
const SEARCH_TIMEOUT_MS = 5000;

/** like のパターン用に \ % _ をエスケープする */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Supabase timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function toShop(row: Pick<ShopRow, "name" | "lat" | "lon" | "address" | "prefecture">): Shop {
  const shop: Shop = { name: row.name, lat: row.lat, lon: row.lon, prefecture: row.prefecture };
  if (row.address) shop.address = row.address;
  return shop;
}

function toRow(shop: OsmShop & { prefecture: string }, updatedAt: Date): ShopRow {
  return {
    osm_id: shop.osmId,
    name: shop.name,
    brand: shop.brand ?? null,
    lat: shop.lat,
    lon: shop.lon,
    address: shop.address ?? null,
    prefecture: shop.prefecture,
    search_key: shop.searchKey,
    updated_at: updatedAt.toISOString(),
  };
}

/** 環境変数から Supabase のクライアントを作る。なければ null */
export function supabaseFromEnv(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** client を渡さなければ環境変数から作る。環境変数がなければ null */
export function createShopStore(client?: SupabaseClient): ShopStore | null {
  client ??= supabaseFromEnv() ?? undefined;
  if (!client) return null;
  const db = client;
  const limit = MAX_SHOPS + 1;

  async function searchAll(key: string): Promise<Shop[]> {
    const shops: Shop[] = [];
    for (let from = 0; from < limit; from += PAGE) {
      const to = Math.min(from + PAGE, limit) - 1;
      const { data, error } = await db
        .from(TABLE)
        .select("name,lat,lon,address,prefecture")
        .like("search_key", `%${escapeLike(key)}%`)
        .order("osm_id")
        .range(from, to);
      if (error) throw new Error(`Supabase search failed: ${error.message}`);
      shops.push(...(data ?? []).map(toShop));
      if ((data ?? []).length < to - from + 1) break;
    }
    return shops;
  }

  return {
    search: (key) => withTimeout(searchAll(key), SEARCH_TIMEOUT_MS),
    async upsert(shops, updatedAt = new Date()) {
      for (let i = 0; i < shops.length; i += PAGE) {
        const rows = shops.slice(i, i + PAGE).map((s) => toRow(s, updatedAt));
        const { error } = await db.from(TABLE).upsert(rows, { onConflict: "osm_id" });
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
      }
    },
    async deleteOlderThan(t) {
      const { count, error } = await db.from(TABLE).delete({ count: "exact" }).lt("updated_at", t.toISOString());
      if (error) throw new Error(`Supabase delete failed: ${error.message}`);
      return count ?? 0;
    },
    async ping() {
      const { error } = await db.from(TABLE).select("osm_id").limit(1);
      if (error) throw new Error(`Supabase ping failed: ${error.message}`);
    },
  };
}
