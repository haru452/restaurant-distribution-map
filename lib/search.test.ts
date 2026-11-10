import { describe, expect, it } from "vitest";
import { OverpassBusyError, type fetchShops } from "./overpass";
import { handleSearch } from "./search";
import type { ShopStore } from "./shopStore";
import type { OsmShop, SearchResult, Shop } from "./types";

const dbShop: Shop = { name: "スシロー 渋谷店", lat: 35.66, lon: 139.7, prefecture: "東京都" };
const liveShop: OsmShop = { osmId: "node/1", name: "スシロー 梅田店", lat: 34.7025, lon: 135.4959, searchKey: "スシロ梅田店" };

function setup(opts: { db?: Shop[] | Error; live?: OsmShop[] | Error; noStore?: boolean }) {
  const upserted: unknown[][] = [];
  const background: Promise<unknown>[] = [];
  const searchedKeys: string[] = [];
  const store: ShopStore = {
    search: async (key) => {
      searchedKeys.push(key);
      if (opts.db instanceof Error) throw opts.db;
      return opts.db ?? [];
    },
    upsert: async (shops) => void upserted.push(shops),
    deleteOlderThan: async () => 0,
    ping: async () => {},
  };
  const fetchLive = (async () => {
    if (opts.live instanceof Error) throw opts.live;
    return { shops: opts.live ?? [], truncated: false };
  }) as unknown as typeof fetchShops;
  const deps = { store: opts.noStore ? null : store, fetchShops: fetchLive, background: (p: Promise<unknown>) => void background.push(p) };
  return { deps, upserted, background, searchedKeys };
}

describe("handleSearch", () => {
  it("q なし・記号だけは 400", async () => {
    const { deps } = setup({});
    expect((await handleSearch(null, deps)).status).toBe(400);
    const r = await handleSearch("！", deps);
    expect(r).toEqual({ status: 400, body: { error: "invalid_query" }, cacheable: false });
  });

  it("Supabase で見つかれば db として返し、Overpass は呼ばない", async () => {
    const { deps, background, searchedKeys } = setup({ db: [dbShop], live: new Error("呼ばれてはいけない") });
    const r = await handleSearch(" すしろー ", deps);
    expect(r.status).toBe(200);
    expect(r.cacheable).toBe(true);
    const body = r.body as SearchResult;
    expect(body).toMatchObject({ query: "スシロー", total: 1, truncated: false, source: "db" });
    expect(body.byPrefecture).toEqual([{ prefecture: "東京都", count: 1 }]);
    expect(searchedKeys).toEqual(["スシロ"]);
    expect(background).toHaveLength(0);
  });

  it("Supabase で 5001件なら 5000件と truncated", async () => {
    const many = Array.from({ length: 5001 }, () => dbShop);
    const { deps } = setup({ db: many });
    const body = (await handleSearch("スシロー", deps)).body as SearchResult;
    expect(body.total).toBe(5000);
    expect(body.shops).toHaveLength(5000);
    expect(body.truncated).toBe(true);
  });

  it("Supabase 0件なら Overpass で探し、見つかった店を裏で保存する", async () => {
    const { deps, upserted, background } = setup({ db: [], live: [liveShop] });
    const r = await handleSearch("スシロー", deps);
    const body = r.body as SearchResult;
    expect(body).toMatchObject({ total: 1, source: "live" });
    expect(body.shops).toEqual([{ name: "スシロー 梅田店", lat: 34.7025, lon: 135.4959, prefecture: "大阪府" }]);
    await Promise.all(background);
    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toEqual([{ ...liveShop, prefecture: "大阪府" }]);
  });

  it("Supabase 失敗なら Overpass で返す", async () => {
    const { deps } = setup({ db: new Error("paused"), live: [liveShop] });
    const r = await handleSearch("スシロー", deps);
    expect(r.status).toBe(200);
    expect((r.body as SearchResult).source).toBe("live");
  });

  it("store が null でも Overpass で返す", async () => {
    const { deps } = setup({ noStore: true, live: [liveShop] });
    const r = await handleSearch("スシロー", deps);
    expect((r.body as SearchResult).total).toBe(1);
  });

  it("両方0件なら 200 で total 0、保存しない", async () => {
    const { deps, background } = setup({ db: [], live: [] });
    const r = await handleSearch("ないみせ", deps);
    expect(r.status).toBe(200);
    expect((r.body as SearchResult).total).toBe(0);
    expect(background).toHaveLength(0);
  });

  it("Overpass が混雑なら 503、キャッシュさせない", async () => {
    const { deps } = setup({ db: [], live: new OverpassBusyError() });
    expect(await handleSearch("スシロー", deps)).toEqual({ status: 503, body: { error: "busy" }, cacheable: false });
  });

  it("その他の失敗は 500", async () => {
    const { deps } = setup({ db: [], live: new Error("boom") });
    expect(await handleSearch("スシロー", deps)).toEqual({ status: 500, body: { error: "internal" }, cacheable: false });
  });
});
