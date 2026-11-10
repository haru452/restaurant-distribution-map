// Gemini API への問い合わせ。サーバー側だけで使う
import { GoogleGenAI } from "@google/genai";

export type Source = { title: string; uri: string };
export type GeminiAnswer = { text: string; sources: Source[]; webChecked: boolean };
export type AskGemini = (prompt: string) => Promise<GeminiAnswer>;

// 2026-11 時点で新しいキーから使え、無料枠で動いたモデル（GEMINI_MODEL で変えられる）
const DEFAULT_MODEL = "gemini-3.5-flash";
const TIMEOUT_MS = 25_000; // 失敗したらもう1回。合わせて Vercel の60秒に収める
const RETRY_WAIT_MS = 2_000;

type GroundedResponse = {
  candidates?: { groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
};

/** Google 検索で参考にしたページを重複なしで取り出す */
export function extractSources(response: GroundedResponse): Source[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: chunk.web?.title || uri, uri });
  }
  return sources;
}

/** 環境変数 GEMINI_API_KEY がなければ null */
export function createGemini(): AskGemini | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  // Google 検索（グラウンディング）は無料枠では使えなかったので、GEMINI_SEARCH=1 のときだけ使う
  const useSearch = process.env.GEMINI_SEARCH === "1";

  const call = async (prompt: string, search: boolean): Promise<GeminiAnswer> => {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        ...(search ? { tools: [{ googleSearch: {} }] } : {}),
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });
    return { text: res.text ?? "", sources: search ? extractSources(res) : [], webChecked: search };
  };
  return async (prompt) => {
    try {
      return await call(prompt, useSearch);
    } catch (e) {
      // 混雑や検索の上限のときは、少し待って検索なしでもう1回
      console.warn("[gemini] 失敗したので、もう1回試します:", (e as Error).message.slice(0, 200));
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
      return call(prompt, false);
    }
  };
}
