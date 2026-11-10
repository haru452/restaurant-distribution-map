import { describe, expect, it } from "vitest";
import { assignPrefectures, countByPrefecture, findPrefecture } from "./prefecture";

describe("findPrefecture", () => {
  it("代表的な駅の都道府県を判定する", () => {
    expect(findPrefecture(35.6812, 139.7671)).toBe("東京都"); // 東京駅
    expect(findPrefecture(34.7025, 135.4959)).toBe("大阪府"); // 大阪駅
    expect(findPrefecture(43.0687, 141.3508)).toBe("北海道"); // 札幌駅
    expect(findPrefecture(26.2058, 127.6465)).toBe("沖縄県"); // 那覇空港付近
  });
  it("海上は 不明", () => {
    expect(findPrefecture(34.0, 139.0)).toBe("不明");
  });
});

describe("countByPrefecture", () => {
  it("件数の多い順に数える", () => {
    const shops = assignPrefectures([
      { name: "A", lat: 35.6812, lon: 139.7671 },
      { name: "B", lat: 35.6895, lon: 139.6917 },
      { name: "C", lat: 34.7025, lon: 135.4959 },
    ]);
    expect(countByPrefecture(shops)).toEqual([
      { prefecture: "東京都", count: 2 },
      { prefecture: "大阪府", count: 1 },
    ]);
  });
  it("同数は都道府県名順", () => {
    const shops = [
      { name: "A", lat: 0, lon: 0, prefecture: "大阪府" },
      { name: "B", lat: 0, lon: 0, prefecture: "京都府" },
    ];
    expect(countByPrefecture(shops).map((p) => p.prefecture)).toEqual(
      ["京都府", "大阪府"].sort((a, b) => a.localeCompare(b, "ja")),
    );
  });
});
