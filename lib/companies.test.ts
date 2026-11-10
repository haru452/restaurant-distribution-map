import { describe, expect, it } from "vitest";
import { buildCompanies, findCompany, shortCompanyName, voteBrandIds, type Company } from "./companies";
import type { Brand } from "./types";

const brands: Brand[] = [
  { name: "ガスト", aliases: ["Gusto"], count: 1000 },
  { name: "バーミヤン", aliases: [], count: 300 },
  { name: "ステーキガスト", aliases: [], count: 100 },
  { name: "すき家", aliases: [], count: 1500 },
  { name: "はま寿司", aliases: [], count: 450 },
];

describe("shortCompanyName", () => {
  it("会社名から「ホールディングス」「株式会社」などを取る", () => {
    expect(shortCompanyName("すかいらーくホールディングス")).toBe("すかいらーく");
    expect(shortCompanyName("株式会社ゼンショーホールディングス")).toBe("ゼンショー");
    expect(shortCompanyName("モスフードサービス")).toBe("モスフードサービス");
  });
});

describe("voteBrandIds", () => {
  it("各チェーンで一番多く付いているIDを選ぶ（会社のIDが少し混ざっていても）", () => {
    const shops = [
      ...Array(5).fill({ name: "ガスト 渋谷店", brand: "ガスト", wikidata: "Q_GUSTO" }),
      ...Array(2).fill({ name: "ガスト 新宿店", brand: "ガスト", wikidata: "Q_SKYLARK" }),
      ...Array(3).fill({ name: "バーミヤン", wikidata: "Q_BAMIYAN" }),
      { name: "すき家", wikidata: "Q_SUKIYA" }, // 1票だけなら選ばない
    ];
    expect(Object.fromEntries(voteBrandIds(shops, brands))).toEqual({ ガスト: "Q_GUSTO", バーミヤン: "Q_BAMIYAN" });
  });
});

describe("buildCompanies", () => {
  const ids = new Map([
    ["ガスト", "Q_GUSTO"],
    ["バーミヤン", "Q_BAMIYAN"],
    ["ステーキガスト", "Q_STEAK"],
    ["すき家", "Q_SUKIYA"],
    ["はま寿司", "Q_HAMA"],
  ]);
  const ancestors = new Map([
    ["Q_GUSTO", [{ qid: "Q_GUSTO", ja: "ガスト" }, { qid: "Q_SKY", ja: "すかいらーくホールディングス", en: "Skylark Holdings" }]],
    ["Q_BAMIYAN", [{ qid: "Q_BAMIYAN", ja: "バーミヤン" }, { qid: "Q_SKY", ja: "すかいらーくホールディングス", en: "Skylark Holdings" }]],
    ["Q_STEAK", [{ qid: "Q_STEAK", ja: "ステーキガスト" }, { qid: "Q_SKY", ja: "すかいらーくホールディングス", en: "Skylark Holdings" }]],
    ["Q_SUKIYA", [{ qid: "Q_SUKIYA", ja: "すき家" }, { qid: "Q_ZFH", ja: "ゼンショーファストホールディングス" }, { qid: "Q_Z", ja: "ゼンショーホールディングス" }]],
    ["Q_HAMA", [{ qid: "Q_HAMA", ja: "はま寿司" }, { qid: "Q_Z", ja: "ゼンショーホールディングス" }]],
  ]);
  const companies = buildCompanies(ids, ancestors, brands);

  it("同じ会社のチェーンをまとめ、店舗数の多い順に並べる", () => {
    const sky = companies.find((c) => c.name === "すかいらーくホールディングス")!;
    expect(sky.brands).toEqual(["ガスト", "バーミヤン", "ステーキガスト"]);
    expect(sky.aliases).toEqual(["すかいらーく", "Skylark Holdings"]);
    expect(sky.count).toBe(1400);
    const zensho = companies.find((c) => c.name === "ゼンショーホールディングス")!;
    expect(zensho.brands).toEqual(["すき家", "はま寿司"]);
  });
  it("チェーンと同じ名前の「会社」は作らない", () => {
    expect(companies.map((c) => c.name)).not.toContain("ガスト");
    expect(companies.map((c) => c.name)).not.toContain("すき家");
  });
  it("1つ上の親会社でも作る（ゼンショーファスト → すき家）", () => {
    expect(companies.find((c) => c.name === "ゼンショーファストホールディングス")?.brands).toEqual(["すき家"]);
  });
});

describe("findCompany", () => {
  const companies: Company[] = [
    { name: "すかいらーくホールディングス", aliases: ["すかいらーく", "Skylark Holdings"], brands: ["ガスト", "バーミヤン"], count: 1300 },
  ];
  it("会社名・短い名前・英語名・先頭3文字以上で見つける", () => {
    expect(findCompany("すかいらーく", companies)?.name).toBe("すかいらーくホールディングス");
    expect(findCompany("スカイラーク", companies)?.name).toBe("すかいらーくホールディングス");
    expect(findCompany("skylark holdings", companies)?.name).toBe("すかいらーくホールディングス");
    expect(findCompany("すかいら", companies)?.name).toBe("すかいらーくホールディングス");
  });
  it("チェーン名や短すぎる語では見つけない", () => {
    expect(findCompany("ガスト", companies)).toBeNull();
    expect(findCompany("すか", companies)).toBeNull();
  });
});
