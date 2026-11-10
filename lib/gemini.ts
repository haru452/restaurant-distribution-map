// Gemini API への問い合わせ。サーバー側だけで使う
import { GoogleGenAI } from "@google/genai";

export type Source = { title: string; uri: string };
export type GeminiAnswer = { text: string; sources: Source[]; webChecked: boolean };
export type AskGemini = (prompt: string) => Promise<GeminiAnswer>;

const DEFAULT_MODEL = "gemini-flash-latest";
const TIMEOUT_MS = 25_000; // 検索ありで失敗したら検索なしでもう1回。合わせて Vercel の60秒に収める

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

  return async (prompt) => {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], httpOptions: { timeout: TIMEOUT_MS } },
      });
      return { text: res.text ?? "", sources: extractSources(res), webChecked: true };
    } catch (e) {
      // 無料枠で検索が使えないときなどは、検索なしで答えてもらう
      console.warn("[gemini] 検索ありで失敗したので、検索なしでやり直します:", (e as Error).message);
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { httpOptions: { timeout: TIMEOUT_MS } },
      });
      return { text: res.text ?? "", sources: [], webChecked: false };
    }
  };
}
