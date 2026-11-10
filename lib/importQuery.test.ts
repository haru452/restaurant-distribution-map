import { describe, expect, it } from "vitest";
import { buildPrefectureQuery, fetchNsiBrands, fetchPrefectureShops } from "./importQuery";

describe("buildPrefectureQuery", () => {
  it("県の範囲で、名前のある飲食店を全部取る", () => {
    const q = buildPrefectureQuery("東京都");
    expect(q).toContain('area["name"="東京都"]["admin_level"="4"]');
    expect(q).toContain("[timeout:300]");
    expect(q).toContain('[~"^(name|name:ja|brand|brand:ja)$"~"."]');
    expect(q).toContain("out center tags;");
  });
});

describe("fetchPrefectureShops", () => {
  it("0件が続いたら失敗にする（その県の古い行を消さないため）", async () => {
    let calls = 0;
    const empty = (async () => {
      calls++;
      return new Response(JSON.stringify({ elements: [] }));
    }) as unknown as typeof fetch;
    await expect(fetchPrefectureShops("東京都", { fetchImpl: empty, tries: 2, waitMs: 0 })).rejects.toThrow("0件");
    expect(calls).toBe(2);
  });
  it("1件以上あれば返す", async () => {
    const one = (async () =>
      new Response(JSON.stringify({ elements: [{ type: "node", id: 1, lat: 35, lon: 139, tags: { name: "店" } }] }))) as unknown as typeof fetch;
    const shops = await fetchPrefectureShops("東京都", { fetchImpl: one, tries: 2, waitMs: 0 });
    expect(shops).toHaveLength(1);
  });
});

describe("fetchNsiBrands", () => {
  it("日本向けの項目だけを、日本語名を優先して返す", async () => {
    const files: Record<string, object> = {
      fast_food: {
        items: [
          { locationSet: { include: ["jp"] }, tags: { name: "Sukiya", "name:ja": "すき家", "name:en": "Sukiya", brand: "すき家" } },
          { locationSet: { include: ["us"] }, tags: { name: "Wendy's" } },
          { locationSet: { include: ["jp"] }, tags: { name: "Komeda", "name:ja": "コメダ珈琲店", "brand:wikidata": "Q11" } },
        ],
      },
    };
    const fakeFetch = (async (url: string) => {
      const amenity = url.split("/").at(-1)!.replace(".json", "");
      const body = files[amenity];
      return body ? new Response(JSON.stringify(body)) : new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    expect(await fetchNsiBrands(fakeFetch)).toStrictEqual([
      { name: "すき家", aliases: ["Sukiya"], count: 0 },
      { name: "コメダ珈琲店", aliases: ["Komeda"], count: 0, wikidata: "Q11" },
    ]);
  });
});
