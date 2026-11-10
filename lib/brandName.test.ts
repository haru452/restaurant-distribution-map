import { describe, expect, it } from "vitest";
import { aggregateBrands, mergeUnseparated, stripBranch } from "./brandName";

describe("stripBranch", () => {
  it("区切りのあとの「○○店」を取る", () => {
    expect(stripBranch("スシロー 渋谷店")).toBe("スシロー");
    expect(stripBranch("スシロー　渋谷店")).toBe("スシロー");
    expect(stripBranch("スシロー・本店")).toBe("スシロー");
  });
  it("区切りがなければそのまま", () => {
    expect(stripBranch("スシロー渋谷店")).toBe("スシロー渋谷店");
    expect(stripBranch("喫茶店")).toBe("喫茶店");
  });
});

describe("mergeUnseparated", () => {
  it("区切りなしの支店名を、先頭が一致する店名にまとめる", () => {
    const merged = mergeUnseparated(new Map([["スシロー", 5], ["スシロー渋谷店", 1], ["喫茶ルノアール", 4]]));
    expect(merged.get("スシロー")).toBe(6);
    expect(merged.has("スシロー渋谷店")).toBe(false);
    expect(merged.get("喫茶ルノアール")).toBe(4);
  });
});

describe("aggregateBrands", () => {
  it("ブランドを優先して数え、3店舗未満を落とし、NSI の別名を合わせる", () => {
    const agg = aggregateBrands(
      [
        { name: "スシロー 渋谷店" }, { name: "スシロー 新宿店" }, { name: "スシロー渋谷店" },
        { name: "なにか", brand: "すき家" }, { name: "x", brand: "すき家" }, { name: "y", brand: "すき家" }, { name: "z", brand: "すき家" },
        { name: "個人店" },
      ],
      [{ name: "すき家", aliases: ["Sukiya"], count: 0 }],
    );
    expect(agg).toEqual([
      { name: "すき家", aliases: ["Sukiya"], count: 4 },
      { name: "スシロー", aliases: [], count: 3 },
    ]);
  });
  it("同じブランドID（Wikidata）の店は、書き方が違っても1つにまとめ、一番多い名前を使う", () => {
    const agg = aggregateBrands(
      [
        ...Array(3).fill({ name: "コメダ珈琲店 渋谷店", brand: "コメダ珈琲店", wikidata: "Q11" }),
        ...Array(2).fill({ name: "コメダ", brand: "コメダ", wikidata: "Q11" }),
      ],
      [],
    );
    expect(agg).toEqual([{ name: "コメダ珈琲店", aliases: ["コメダ"], count: 5 }]);
  });
  it("IDがなくても「珈琲」「珈琲店」「コーヒーショップ」などの語尾の違いはまとめる", () => {
    const agg = aggregateBrands(
      [
        ...Array(3).fill({ name: "x", brand: "コメダ珈琲店" }),
        ...Array(2).fill({ name: "x", brand: "コメダ珈琲" }),
        { name: "x", brand: "コメダ" },
        ...Array(3).fill({ name: "x", brand: "ドトールコーヒーショップ" }),
        ...Array(3).fill({ name: "x", brand: "ドトール" }),
      ],
      [],
    );
    expect(agg).toEqual([
      { name: "コメダ珈琲店", aliases: ["コメダ珈琲"], count: 6 },
      { name: "ドトールコーヒーショップ", aliases: ["ドトール"], count: 6 },
    ]);
  });
  it("先頭が同じだけの別の店はまとめない", () => {
    const agg = aggregateBrands(
      [...Array(3).fill({ name: "x", brand: "すし" }), ...Array(3).fill({ name: "x", brand: "すし丸" })],
      [],
    );
    expect(agg.map((b) => b.name).sort()).toEqual(["すし", "すし丸"]);
  });
  it("NSI の項目も ID でまとめる", () => {
    const agg = aggregateBrands(
      Array(3).fill({ name: "x", brand: "コメダ珈琲店", wikidata: "Q11" }),
      [{ name: "コメダ", aliases: ["Komeda"], count: 0, wikidata: "Q11" }],
    );
    expect(agg).toEqual([{ name: "コメダ珈琲店", aliases: ["コメダ", "Komeda"], count: 3 }]);
  });
  it("OSM にない NSI の名前は count 0 で残す", () => {
    const agg = aggregateBrands([], [{ name: "コメダ珈琲店", aliases: [], count: 0 }]);
    expect(agg).toEqual([{ name: "コメダ珈琲店", aliases: [], count: 0 }]);
  });
});
