"use client";
// 「なぜこの分布？」ボタンと、Gemini の考察の表示
import { useEffect, useRef, useState } from "react";
import type { Insight } from "@/lib/insight";

type Props = { query: string; onHqChange: (query: string, prefecture: string | null) => void };

const ERRORS: Record<string, string> = {
  daily_limit: "今日の考察の上限（100回）に達しました。明日またお試しください",
  ai_unavailable: "AIが混み合っているか、使えない状態です。少し待ってもう一度お試しください",
  no_shops: "店が見つからないため考察できません",
  ai_not_configured: "AIの設定（GeminiのAPIキー）がまだ反映されていません",
};

export function InsightPanel({ query, onHqChange }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [insight, setInsight] = useState<Insight>();
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  // 店名が変わったら、聞いている途中の考察を止める（表示は下の key で作り直される）
  useEffect(() => () => controllerRef.current?.abort(), [query]);

  async function ask() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("loading");
    try {
      const res = await fetch(`/api/insight?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      const body = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setError(ERRORS[body?.error] ?? "エラーが発生しました");
        setState("error");
        return;
      }
      setInsight(body as Insight);
      onHqChange(query, (body as Insight).hqPrefecture);
      setState("done");
    } catch {
      if (controller.signal.aborted) return;
      setError("エラーが発生しました");
      setState("error");
    }
  }

  if (state === "idle" || state === "error") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={ask}
          className="w-full rounded-lg border border-accent px-4 py-2 font-bold text-accent transition hover:bg-accent/10"
        >
          🤖 なぜこの分布？（AIの考察）
        </button>
        {state === "error" && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (state === "loading") {
    return (
      <p className="rounded-lg bg-accent/5 px-4 py-3 text-sm text-ink" role="status">
        🤖 考え中…（10〜30秒かかることがあります）
      </p>
    );
  }

  return (
    <section aria-label="AIの考察" className="space-y-3 rounded-lg bg-accent/5 p-4 text-sm text-ink">
      {(insight!.genre || insight!.famousFor?.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {insight!.genre && (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">{insight!.genre}</span>
          )}
          {insight!.famousFor?.map((f) => (
            <span key={f} className="rounded-full border border-accent/40 bg-surface px-2.5 py-0.5 text-xs text-ink">
              {f}
            </span>
          ))}
        </div>
      )}
      <p className="font-bold">🤖 {insight!.summary}</p>
      {insight!.hqPrefecture && (
        <p>
          <span className="text-muted">本社・創業の地：</span>
          <span className="font-bold">{insight!.hqPrefecture}</span>
          <span className="text-muted">（地図に枠で表示）</span>
        </p>
      )}
      {insight!.reasons.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {insight!.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {insight!.sources.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted">参考にしたWebページ（{insight!.sources.length}件）</summary>
          <ul className="mt-1 space-y-1">
            {insight!.sources.map((s) => (
              <li key={s.uri}>
                <a href={s.uri} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted">
        AIの考察です。正確でない場合があります。{!insight!.webChecked && "（Webで調べた結果ではなく、AIの知識による考察です）"}
      </p>
    </section>
  );
}
