import { describe, expect, it } from "vitest";
import { isValidQuery, looseKey, normalizeQuery } from "./normalize";

describe("normalizeQuery", () => {
  it("前後の空白を除き、ひらがなをカタカナにする", () => {
    expect(normalizeQuery("  すしろー ")).toBe("スシロー");
  });
  it("全角英数字を半角にし、空白を1つにする", () => {
    expect(normalizeQuery("ＭＯＳ　バーガー")).toBe("MOS バーガー");
  });
  it("漢字はそのまま", () => {
    expect(normalizeQuery("すき家")).toBe("スキ家");
  });
});

describe("isValidQuery", () => {
  it("記号だけ・空白だけは不正", () => {
    expect(isValidQuery(normalizeQuery("！？"))).toBe(false);
    expect(isValidQuery(normalizeQuery("   "))).toBe(false);
  });
  it("文字を含めば正しい", () => {
    expect(isValidQuery(normalizeQuery("C&C"))).toBe(true);
  });
});

describe("looseKey", () => {
  it("小さい字と大きい字、ひらがなとカタカナを同じにする", () => {
    expect(looseKey("サイゼリャ")).toBe(looseKey("さいぜりや"));
  });
  it("「ー」を除く", () => {
    expect(looseKey("スシロー")).toBe("スシロ");
  });
  it("英字は小文字、空白は除く", () => {
    expect(looseKey("Mos Burger")).toBe("mosburger");
  });
});
