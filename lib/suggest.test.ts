import { describe, expect, it } from "vitest";
import { suggest } from "./suggest";
import type { Brand } from "./types";

const brands: Brand[] = [
  { name: "サイゼリヤ", aliases: ["Saizeriya"], count: 900 },
  { name: "マクドナルド", aliases: ["McDonald's"], count: 2900 },
  { name: "スシロー", aliases: [], count: 600 },
  { name: "スシローコノミ", aliases: [], count: 3 },
  { name: "すき家", aliases: ["Sukiya"], count: 1900 },
];

describe("suggest", () => {
  it("1文字違いの誤字を直す", () => {
    expect(suggest("サイゼリア", brands)[0].name).toBe("サイゼリヤ");
    expect(suggest("マクドナルト", brands)[0].name).toBe("マクドナルド");
  });
  it("途中まで・ひらがなでも先頭一致で出す", () => {
    expect(suggest("すしろ", brands)[0].name).toBe("スシロー");
  });
  it("漢字が混ざる店名も読みの近さで出す", () => {
    expect(suggest("すきや", brands)[0].name).toBe("すき家");
  });
  it("別名（英語）でも出す", () => {
    expect(suggest("mcdonald", brands)[0].name).toBe("マクドナルド");
  });
  it("関係ない語や1文字では出さない", () => {
    expect(suggest("あいうえおかき", brands)).toEqual([]);
    expect(suggest("す", brands)).toEqual([]);
  });
  it("件数の上限を守る", () => {
    expect(suggest("すしろ", brands, 1)).toHaveLength(1);
  });
});
