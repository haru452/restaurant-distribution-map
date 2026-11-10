import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createShopStore, escapeLike } from "./shopStore";

/** range(from, to) で行を切って返す、最小限の偽 Supabase クライアント */
function fakeClient(total: number) {
  const calls: { like?: [string, string]; range?: [number, number] }[] = [];
  const rows = Array.from({ length: total }, (_, i) => ({
    name: `店${i}`, lat: 35, lon: 139, address: null, prefecture: "東京都",
  }));
  const client = {
    from() {
      const call: (typeof calls)[number] = {};
      calls.push(call);
      const builder = {
        select: () => builder,
        order: () => builder,
        like: (col: string, pattern: string) => ((call.like = [col, pattern]), builder),
        range: (from: number, to: number) => {
          call.range = [from, to];
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("escapeLike", () => {
  it("like の特殊文字の前に \\ を付ける", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});

describe("searchShops", () => {
  it("1000件ずつ取り、最後が1000件未満なら止める", async () => {
    const { client, calls } = fakeClient(2500);
    const shops = await createShopStore(client)!.search("スシロ");
    expect(shops).toHaveLength(2500);
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(calls[0].like).toEqual(["search_key", "%スシロ%"]);
  });
  it("1000件ずつ取り 5001件で止める", async () => {
    const { client, calls } = fakeClient(6000);
    const shops = await createShopStore(client)!.search("店");
    expect(shops).toHaveLength(5001);
    expect(calls.at(-1)!.range).toEqual([5000, 5000]);
  });
  it("住所がない行は address を付けない", async () => {
    const { client } = fakeClient(1);
    const [shop] = await createShopStore(client)!.search("店");
    expect(shop).toEqual({ name: "店0", lat: 35, lon: 139, prefecture: "東京都" });
  });
});

describe("createShopStore", () => {
  it("環境変数がなければ null", () => {
    const saved = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(createShopStore()).toBeNull();
    process.env = saved;
  });
});
