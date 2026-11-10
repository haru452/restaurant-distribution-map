import { describe, expect, it } from "vitest";
import { missingPrefectures, PREFECTURES } from "./prefectureOrder";

describe("PREFECTURES", () => {
  it("北から南の順に47都道府県", () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(PREFECTURES[0]).toBe("北海道");
    expect(PREFECTURES[12]).toBe("東京都");
    expect(PREFECTURES[46]).toBe("沖縄県");
  });
});

describe("missingPrefectures", () => {
  it("店がない都道府県を北から順に返す（「不明」は数えない）", () => {
    const counts: { prefecture: string; count: number }[] = PREFECTURES.filter((p) => !["青森県", "沖縄県", "富山県"].includes(p)).map((p) => ({ prefecture: p, count: 1 }));
    counts.push({ prefecture: "不明", count: 2 });
    expect(missingPrefectures(counts)).toEqual(["青森県", "富山県", "沖縄県"]);
  });
  it("全部にあれば空", () => {
    expect(missingPrefectures(PREFECTURES.map((p) => ({ prefecture: p, count: 3 })))).toEqual([]);
  });
});
