import { describe, expect, it } from "vitest";
import { buildInsightPrompt, DAILY_LIMIT, handleInsight, parseInsight, type Insight, type InsightDeps } from "./insight";
import type { SearchResult } from "./types";

const result: SearchResult = {
  query: "スシロー",
  total: 120,
  truncated: false,
  source: "db",
  shops: [],
  byPrefecture: [
    { prefecture: "大阪府", count: 60 },
    { prefecture: "東京都", count: 50 },
    { prefecture: "鳥取県", count: 10 },
  ],
};

describe("buildInsightPrompt", () => {
  it("店名・件数・人口あたりの店数を入れる", () => {
    const prompt = buildInsightPrompt(result);
    expect(prompt).toContain("スシロー");
    expect(prompt).toContain("全国 120店");
    expect(prompt).toContain("大阪府: 60店");
    // 鳥取県は人口55万人なので、100万人あたり約18.1店
    expect(prompt).toContain("鳥取県: 10店（100万人あたり18.1店）");
    expect(prompt).toContain("0店の都道府県");
  });
});

describe("buildInsightPrompt（会社名のとき）", () => {
  it("会社のチェーンをまとめた分布だと伝え、チェーンごとの店数を入れる", () => {
    const prompt = buildInsightPrompt({
      ...result,
      query: "スカイラーク",
      company: { name: "すかいらーくホールディングス", brands: [{ name: "ガスト", count: 80 }, { name: "バーミヤン", count: 40 }] },
    });
    expect(prompt).toContain("会社「すかいらーくホールディングス」");
    expect(prompt).toContain("ガスト 80店、バーミヤン 40店");
  });
});

describe("parseInsight", () => {
  it("```json で囲まれていても読む", () => {
    const text = '考察です\n```json\n{"summary":"大阪発","genre":"回転寿司","famousFor":["まぐろ","サイドメニュー"],"hqPrefecture":"大阪府","reasons":["a","b"]}\n```';
    expect(parseInsight(text)).toEqual({
      summary: "大阪発",
      genre: "回転寿司",
      famousFor: ["まぐろ", "サイドメニュー"],
      hqPrefecture: "大阪府",
      reasons: ["a", "b"],
    });
  });
  it("何屋さん・有名なものがなくても読める（null と空）", () => {
    const r = parseInsight('{"summary":"s","hqPrefecture":null,"reasons":[]}');
    expect(r.genre).toBeNull();
    expect(r.famousFor).toEqual([]);
  });
  it("知らない都道府県名や空は null にする", () => {
    expect(parseInsight('{"summary":"s","hqPrefecture":"大阪","reasons":[]}').hqPrefecture).toBeNull();
    expect(parseInsight('{"summary":"s","hqPrefecture":"","reasons":[]}').hqPrefecture).toBeNull();
  });
  it("JSON がなければ例外", () => {
    expect(() => parseInsight("ごめんなさい")).toThrow();
  });
});

function setup(opts: { cached?: Insight; allowed?: boolean; total?: number; geminiError?: Error; search?: boolean } = {}) {
  const calls = { gemini: 0, usage: 0, saved: [] as Insight[] };
  const deps: InsightDeps = {
    cache: {
      get: async () => opts.cached ?? null,
      save: async (_q, insight) => void calls.saved.push(insight),
      tryUse: async (limit) => {
        calls.usage++;
        expect(limit).toBe(DAILY_LIMIT);
        return opts.allowed ?? true;
      },
    },
    search: async () => ({ ...result, total: opts.total ?? result.total }),
    gemini: async () => {
      calls.gemini++;
      if (opts.geminiError) throw opts.geminiError;
      return {
        text: '{"summary":"大阪発のチェーン","genre":"回転寿司","famousFor":["まぐろ"],"hqPrefecture":"大阪府","reasons":["創業地","都市部"]}',
        sources: [{ title: "会社概要", uri: "https://example.com" }],
        webChecked: opts.search ?? true,
      };
    },
    now: () => new Date("2026-11-10T00:00:00Z"),
  };
  return { deps, calls };
}

describe("handleInsight", () => {
  it("1日の上限は100回", () => {
    expect(DAILY_LIMIT).toBe(100);
  });

  it("不正な店名は 400", async () => {
    const { deps } = setup();
    expect((await handleInsight("！", deps)).status).toBe(400);
  });

  it("保存済みなら Gemini も回数も使わない", async () => {
    const cached: Insight = { query: "スシロー", summary: "前の考察", genre: "回転寿司", famousFor: [], hqPrefecture: "大阪府", reasons: [], sources: [], webChecked: true, createdAt: "2026-11-01T00:00:00Z" };
    const { deps, calls } = setup({ cached });
    const r = await handleInsight("すしろー", deps);
    expect(r).toMatchObject({ status: 200, body: { summary: "前の考察" } });
    expect(calls.gemini).toBe(0);
    expect(calls.usage).toBe(0);
  });

  it("新しく考察して保存する", async () => {
    const { deps, calls } = setup();
    const r = await handleInsight("すしろー", deps);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      query: "スシロー",
      summary: "大阪発のチェーン",
      genre: "回転寿司",
      famousFor: ["まぐろ"],
      hqPrefecture: "大阪府",
      reasons: ["創業地", "都市部"],
      sources: [{ title: "会社概要", uri: "https://example.com" }],
      webChecked: true,
      createdAt: "2026-11-10T00:00:00.000Z",
    });
    expect(calls.saved).toHaveLength(1);
  });

  it("何屋さんが入っていない古い保存は使わず、考察し直す", async () => {
    const old = { query: "スシロー", summary: "古い", hqPrefecture: "大阪府", reasons: [], sources: [], webChecked: true, createdAt: "2026-11-09T00:00:00Z" } as unknown as Insight;
    const { deps, calls } = setup({ cached: old });
    const r = await handleInsight("スシロー", deps);
    expect(r.body).toMatchObject({ genre: "回転寿司" });
    expect(calls.gemini).toBe(1);
  });

  it("その日の上限を超えたら 429、Gemini は呼ばない", async () => {
    const { deps, calls } = setup({ allowed: false });
    const r = await handleInsight("スシロー", deps);
    expect(r).toEqual({ status: 429, body: { error: "daily_limit" } });
    expect(calls.gemini).toBe(0);
  });

  it("利用回数を数えられない（表がないなど）ときは 503、Gemini は呼ばない", async () => {
    const { deps, calls } = setup();
    deps.cache!.tryUse = async () => {
      throw new Error("function use_gemini does not exist");
    };
    expect(await handleInsight("スシロー", deps)).toEqual({ status: 503, body: { error: "ai_unavailable" } });
    expect(calls.gemini).toBe(0);
  });

  it("Gemini のキーがなければ 503 ai_not_configured（設定漏れと分かるように）", async () => {
    const { deps, calls } = setup();
    deps.gemini = null;
    expect(await handleInsight("スシロー", deps)).toEqual({ status: 503, body: { error: "ai_not_configured" } });
    expect(calls.usage).toBe(0);
  });

  it("店が0件なら 404、回数を使わない", async () => {
    const { deps, calls } = setup({ total: 0 });
    expect((await handleInsight("ないみせ", deps)).status).toBe(404);
    expect(calls.usage).toBe(0);
  });

  it("Gemini が失敗したら 503、保存しない", async () => {
    const { deps, calls } = setup({ geminiError: new Error("quota") });
    expect(await handleInsight("スシロー", deps)).toEqual({ status: 503, body: { error: "ai_unavailable" } });
    expect(calls.saved).toHaveLength(0);
  });
});
