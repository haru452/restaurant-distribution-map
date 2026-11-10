import { describe, expect, it } from "vitest";
import { buildAncestorsQuery, parseAncestors } from "./wikidata";

describe("buildAncestorsQuery", () => {
  it("IDを VALUES に並べ、親会社（P749/P127）を2段までたどる", () => {
    const q = buildAncestorsQuery(["Q1", "Q22"]);
    expect(q).toContain("VALUES ?item { wd:Q1 wd:Q22 }");
    expect(q).toContain("wdt:P749|wdt:P127");
  });
  it("Q と数字以外のIDは入れない", () => {
    expect(buildAncestorsQuery(["Q1", "x } DROP", "Q2"])).toContain("VALUES ?item { wd:Q1 wd:Q2 }");
  });
});

describe("parseAncestors", () => {
  it("自分・親・その親を、重複なしで並べる", () => {
    const uri = (q: string) => ({ value: `http://www.wikidata.org/entity/${q}` });
    const lit = (v: string) => ({ value: v });
    const json = {
      results: {
        bindings: [
          { item: uri("Q1"), itemJa: lit("ガスト"), p: uri("Q9"), pJa: lit("すかいらーくホールディングス"), pEn: lit("Skylark Holdings") },
          { item: uri("Q1"), itemJa: lit("ガスト"), p: uri("Q9"), pJa: lit("すかいらーくホールディングス"), pEn: lit("Skylark Holdings") },
          { item: uri("Q2"), itemJa: lit("すき家"), p: uri("Q5"), pJa: lit("ゼンショーファスト"), g: uri("Q6"), gJa: lit("ゼンショーホールディングス") },
          { item: uri("Q3") },
        ],
      },
    };
    const a = parseAncestors(json);
    expect(a.get("Q1")).toEqual([
      { qid: "Q1", ja: "ガスト" },
      { qid: "Q9", ja: "すかいらーくホールディングス", en: "Skylark Holdings" },
    ]);
    expect(a.get("Q2")!.map((x) => x.qid)).toEqual(["Q2", "Q5", "Q6"]);
    expect(a.get("Q3")).toEqual([{ qid: "Q3" }]);
  });
});
