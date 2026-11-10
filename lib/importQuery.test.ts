import { describe, expect, it } from "vitest";
import { buildPrefectureQuery, fetchNsiBrands } from "./importQuery";

describe("buildPrefectureQuery", () => {
  it("県の範囲で、名前のある飲食店を全部取る", () => {
    const q = buildPrefectureQuery("東京都");
    expect(q).toContain('area["name"="東京都"]["admin_level"="4"]');
    expect(q).toContain("[timeout:300]");
    expect(q).toContain('[~"^(name|name:ja|brand|brand:ja)$"~"."]');
    expect(q).toContain("out center tags;");
  });
});

describe("fetchNsiBrands", () => {
  it("日本向けの項目だけを、日本語名を優先して返す", async () => {
    const files: Record<string, object> = {
      fast_food: {
        items: [
          { locationSet: { include: ["jp"] }, tags: { name: "Sukiya", "name:ja": "すき家", "name:en": "Sukiya", brand: "すき家" } },
          { locationSet: { include: ["us"] }, tags: { name: "Wendy's" } },
        ],
      },
    };
    const fakeFetch = (async (url: string) => {
      const amenity = url.split("/").at(-1)!.replace(".json", "");
      const body = files[amenity];
      return body ? new Response(JSON.stringify(body)) : new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    expect(await fetchNsiBrands(fakeFetch)).toEqual([{ name: "すき家", aliases: ["Sukiya"], count: 0 }]);
  });
});
