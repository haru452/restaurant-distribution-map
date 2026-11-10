import { describe, expect, it } from "vitest";
import { normalizeQuery } from "./normalize";
import { buildPattern, buildQuery, fetchShops, MAX_SHOPS, OverpassBusyError, parseElements, toRawShop } from "./overpass";

const re = (q: string) => new RegExp(buildPattern(normalizeQuery(q)), "i");
const res = (body: object, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("buildPattern", () => {
  it("かなを両方に一致させる", () => {
    expect(re("すき家").test("すき家 渋谷店")).toBe(true);
    expect(re("スキ家").test("すき家")).toBe(true);
  });
  it("小さい字と大きい字、「ー」のあり・なしを同じに扱う", () => {
    expect(re("サイゼリヤ").test("サイゼリャ")).toBe(true);
    expect(re("スシロー").test("スシロ")).toBe(true);
  });
  it("特殊文字を無害化する", () => {
    expect(re("ラーメン(仮).").test("ラーメン(仮).")).toBe(true);
    expect(re("ラーメン(仮).").test("ラーメン仮X")).toBe(false);
  });
});

describe("buildQuery", () => {
  it("QL 文字列の引用符をエスケープする", () => {
    expect(buildQuery('a"b')).toContain('a\\"b');
  });
  it("上限+1件を要求する", () => {
    expect(buildQuery("スシロー")).toContain("out center 5001;");
  });
});

describe("parseElements", () => {
  it("name がなければ brand を使い、名前なしは除外し、住所をつなげる", () => {
    expect(
      parseElements({
        elements: [
          { type: "node", id: 1, lat: 35, lon: 139, tags: { name: "スシロー 渋谷店", "addr:province": "東京都", "addr:city": "渋谷区" } },
          { type: "way", id: 2, center: { lat: 34, lon: 135 }, tags: { brand: "スシロー" } },
          { type: "node", id: 3, lat: 33, lon: 130, tags: {} },
        ],
      }),
    ).toEqual([
      { osmId: "node/1", name: "スシロー 渋谷店", lat: 35, lon: 139, address: "東京都渋谷区", searchKey: "スシロ渋谷店" },
      { osmId: "way/2", name: "スシロー", brand: "スシロー", lat: 34, lon: 135, searchKey: "スシロ" },
    ]);
  });
  it("search_key は looseKey を使う", () => {
    const [shop] = parseElements({ elements: [{ type: "node", id: 9, lat: 1, lon: 2, tags: { name: "すき家 渋谷店", brand: "すき家" } }] });
    expect(shop.searchKey).toBe("スキ家渋谷店|スキ家");
    expect(toRawShop(shop)).toEqual({ name: "すき家 渋谷店", lat: 1, lon: 2 });
  });
  it("addr:full を優先する", () => {
    const [shop] = parseElements({ elements: [{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "A", "addr:full": "東京都千代田区1-1", "addr:city": "X" } }] });
    expect(shop.address).toBe("東京都千代田区1-1");
  });
});

describe("fetchShops", () => {
  it("remark の時間切れは OverpassBusyError", async () => {
    const body = { elements: [], remark: 'runtime error: Query timed out in "query" at line 4 after 51 seconds.' };
    await expect(fetchShops("スシロー", res(body))).rejects.toBeInstanceOf(OverpassBusyError);
  });
  it("429 は OverpassBusyError", async () => {
    await expect(fetchShops("スシロー", res({}, 429))).rejects.toBeInstanceOf(OverpassBusyError);
  });
  it("500 は Busy ではない Error", async () => {
    const e = await fetchShops("スシロー", res({}, 500)).catch((err) => err);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(OverpassBusyError);
  });
  it("5001件なら 5000件と truncated: true", async () => {
    const elements = Array.from({ length: MAX_SHOPS + 1 }, (_, i) => ({ type: "node", id: i, lat: 35, lon: 139, tags: { name: `店${i}` } }));
    const out = await fetchShops("店", res({ elements }));
    expect(out.shops).toHaveLength(5000);
    expect(out.truncated).toBe(true);
  });
  it("上限以下なら truncated: false", async () => {
    const out = await fetchShops("店", res({ elements: [{ type: "node", id: 1, lat: 35, lon: 139, tags: { name: "店" } }] }));
    expect(out).toEqual({ shops: [{ osmId: "node/1", name: "店", lat: 35, lon: 139, searchKey: "店" }], truncated: false });
  });
});
