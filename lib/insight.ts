// 分布の考察：Gemini に「なぜこの分布になるのか」を考えてもらう
import populationData from "@/data/population.json";
import type { AskGemini, Source } from "./gemini";
import { isValidQuery, normalizeQuery } from "./normalize";
import type { SearchResult } from "./types";

export const DAILY_LIMIT = 100;
const CACHE_DAYS = 30;
const MAX_QUERY_LENGTH = 60;

export type Insight = {
  query: string;
  summary: string;
  hqPrefecture: string | null;
  reasons: string[];
  sources: Source[];
  webChecked: boolean;
  createdAt: string;
};

export type InsightCache = {
  get(query: string): Promise<Insight | null>;
  save(query: string, insight: Insight): Promise<void>;
  /** 今日の利用回数を1つ増やし、上限以内なら true */
  tryUse(limit: number): Promise<boolean>;
};

export type InsightDeps = {
  cache: InsightCache | null;
  search: (query: string) => Promise<SearchResult>;
  gemini: AskGemini | null;
  now?: () => Date;
};

export type InsightResponse = { status: number; body: Insight | { error: string } };

const POPULATION: Record<string, number> = Object.fromEntries(
  Object.entries(populationData).filter(([k]) => !k.startsWith("_")),
) as Record<string, number>;

const perMillion = (count: number, prefecture: string) =>
  POPULATION[prefecture] ? ((count / POPULATION[prefecture]) * 1_000_000).toFixed(1) : "?";

export function buildInsightPrompt(result: SearchResult): string {
  const counts = new Map(result.byPrefecture.map((p) => [p.prefecture, p.count]));
  const lines = result.byPrefecture
    .filter((p) => POPULATION[p.prefecture])
    .map((p) => `- ${p.prefecture}: ${p.count}店（100万人あたり${perMillion(p.count, p.prefecture)}店）`);
  const zero = Object.keys(POPULATION).filter((p) => !counts.has(p));

  return [
    "あなたは日本の外食チェーンに詳しいアナリストです。",
    `「${result.query}」という店名で OpenStreetMap を検索した、日本国内の店舗の分布データがあります。`,
    "Google 検索で本社・創業地・沿革・出店戦略などを確かめたうえで、なぜこのような分布になっているのかを考察してください。",
    "",
    `全国 ${result.total}店${result.truncated ? "（多すぎるため一部のみ）" : ""}`,
    "都道府県ごとの店数（多い順）：",
    ...lines,
    `0店の都道府県：${zero.length > 0 ? zero.join("、") : "なし"}`,
    "",
    "注意：",
    "- データは OpenStreetMap のもので、実際の店舗数より少ないことがあります",
    "- 確かめられないことは「〜と考えられます」のように推測だと分かる書き方にしてください",
    "- 一般的な言葉（例：ラーメン）や個人店などチェーンではなさそうな場合は、その旨を summary に書き、hqPrefecture は null にしてください",
    "",
    "出力は次の形の JSON だけにしてください（説明文は付けない）：",
    '{"summary": "1〜2文のまとめ", "hqPrefecture": "本社または創業の地の都道府県名（例：大阪府）。分からなければ null", "reasons": ["分布の理由を1〜2文で", "…（3〜5個）"]}',
  ].join("\n");
}

/** Gemini の答えから JSON を取り出す */
export function parseInsight(text: string): Pick<Insight, "summary" | "hqPrefecture" | "reasons"> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON が見つかりません");
  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  if (typeof raw.summary !== "string" || !raw.summary) throw new Error("summary がありません");
  const hq = typeof raw.hqPrefecture === "string" && POPULATION[raw.hqPrefecture] ? raw.hqPrefecture : null;
  const reasons = Array.isArray(raw.reasons) ? raw.reasons.filter((r): r is string => typeof r === "string" && !!r).slice(0, 6) : [];
  return { summary: raw.summary, hqPrefecture: hq, reasons };
}

export async function handleInsight(rawQuery: string | null, deps: InsightDeps): Promise<InsightResponse> {
  const now = deps.now ?? (() => new Date());
  const query = normalizeQuery(rawQuery ?? "");
  if (!isValidQuery(query) || query.length > MAX_QUERY_LENGTH) return { status: 400, body: { error: "invalid_query" } };

  // 1. 保存済みの考察（30日以内）
  const cached = await deps.cache?.get(query).catch(() => null);
  if (cached && now().getTime() - new Date(cached.createdAt).getTime() < CACHE_DAYS * 86_400_000) {
    return { status: 200, body: cached };
  }

  // 2. 分布データ
  const result = await deps.search(query);
  if (result.total === 0) return { status: 404, body: { error: "no_shops" } };
  if (!deps.gemini) return { status: 503, body: { error: "ai_unavailable" } };

  // 3. 1日の上限
  if (deps.cache) {
    let allowed: boolean;
    try {
      allowed = await deps.cache.tryUse(DAILY_LIMIT);
    } catch (e) {
      // 数えられないときは上限を守れないので、Gemini は呼ばない
      console.warn("[insight] 利用回数を数えられませんでした:", (e as Error).message);
      return { status: 503, body: { error: "ai_unavailable" } };
    }
    if (!allowed) return { status: 429, body: { error: "daily_limit" } };
  }

  // 4. Gemini に考察してもらう
  let insight: Insight;
  try {
    const answer = await deps.gemini(buildInsightPrompt(result));
    insight = {
      query,
      ...parseInsight(answer.text),
      sources: answer.sources.slice(0, 8),
      webChecked: answer.webChecked,
      createdAt: now().toISOString(),
    };
  } catch (e) {
    console.error("[insight] Gemini で考察できませんでした:", e);
    return { status: 503, body: { error: "ai_unavailable" } };
  }

  await deps.cache?.save(query, insight).catch((e) => console.warn("[insight] 保存に失敗:", (e as Error).message));
  return { status: 200, body: insight };
}
