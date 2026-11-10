"use client";
// 全国の店舗数、都道府県ランキング、0件のときの「もしかして」
import { suggest } from "@/lib/suggest";
import type { SearchResult } from "@/lib/types";
import { InsightPanel } from "./InsightPanel";
import { useBrands } from "./useBrands";

type Props = { result: SearchResult; onSearch: (q: string) => void; onHqChange: (query: string, prefecture: string | null) => void };

export function RankingPanel({ result, onSearch, onHqChange }: Props) {
  const brands = useBrands(result.total === 0);

  if (result.total === 0) {
    const maybe = suggest(result.query, brands, 3).filter((b) => b.name !== result.query);
    return (
      <div className="space-y-3">
        <p className="text-ink">見つかりませんでした。カタカナや英語の表記も試してください</p>
        {maybe.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">もしかして：</span>
            {maybe.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => onSearch(b.name)}
                className="rounded-full border border-accent px-3 py-1 text-accent hover:bg-accent/10"
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const max = result.byPrefecture[0]?.count ?? 1;
  return (
    <div className="space-y-3">
      <p className="text-ink">
        <span className="text-sm text-muted">「{result.query}」全国</span>
        <br />
        <span className="text-3xl font-bold tabular-nums">{result.total.toLocaleString()}</span>
        <span className="ml-1">店</span>
      </p>
      {result.truncated && <p className="text-sm text-danger">件数が多いため一部のみ表示しています</p>}
      <InsightPanel key={result.query} query={result.query} onHqChange={onHqChange} />
      <ol className="space-y-1.5">
        {result.byPrefecture.map((p, i) => (
          <li key={p.prefecture} className="grid grid-cols-[2rem_4.5rem_1fr_3.5rem] items-center gap-2 text-sm">
            <span className="text-right tabular-nums text-muted">{i + 1}</span>
            <span className="truncate text-ink">{p.prefecture}</span>
            <span className="h-2.5 rounded-full bg-line" aria-hidden>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(p.count / max) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums text-ink">{p.count.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
