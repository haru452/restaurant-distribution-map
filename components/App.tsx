"use client";
// 画面全体：検索欄、地図、ランキング
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { missingPrefectures } from "@/lib/prefectureOrder";
import { RankingPanel } from "./RankingPanel";
import { SearchBar } from "./SearchBar";
import { useSearch } from "./useSearch";

// Leaflet は window を使うので、サーバーでは描かない
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-muted">地図を読み込み中…</div>,
});

export function App() {
  const { state, result, error, search, retry } = useSearch();
  // AIの考察で分かった本社の県（どの店名の考察かも覚えておき、別の店名の結果には出さない）
  const [hq, setHq] = useState<{ query: string; prefecture: string } | null>(null);
  const onHqChange = useCallback(
    (query: string, prefecture: string | null) => setHq(prefecture ? { query, prefecture } : null),
    [],
  );
  const hqPrefecture = hq && hq.query === result?.query ? hq.prefecture : null;
  // 店がない県を見ているか（どの店名のときに押したかを覚えておき、別の検索では戻す）
  const [missingFor, setMissingFor] = useState<string | null>(null);
  const showMissing = !!result && missingFor === result.query;
  const missing = showMissing && result ? missingPrefectures(result.byPrefecture) : null;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-4 px-4 py-4 lg:py-6">
      <header className="space-y-3">
        <h1 className="text-xl font-bold text-ink lg:text-2xl">レストラン分布マップ</h1>
        <SearchBar onSearch={search} disabled={state === "loading"} />
      </header>

      <main className="flex flex-1 flex-col gap-4 lg:h-[calc(100dvh-12rem)] lg:min-h-[480px] lg:flex-none lg:flex-row">
        <section aria-label="地図" className="relative h-[55vh] min-h-[320px] overflow-hidden rounded-xl border border-line bg-surface lg:h-full lg:min-h-0 lg:flex-1">
          <MapView result={result} hqPrefecture={hqPrefecture} missing={missing} onHideMissing={() => setMissingFor(null)} />
          {state === "loading" && (
            <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-1 bg-surface/70 text-ink backdrop-blur-sm">
              <p className="font-bold">検索中…</p>
              <p className="text-sm text-muted">初めての店は時間がかかることがあります</p>
            </div>
          )}
        </section>

        <aside aria-label="都道府県ランキング" className="rounded-xl border border-line bg-surface p-4 lg:h-full lg:w-96 lg:overflow-y-auto">
          {state === "idle" && (
            <p className="text-muted">店名で検索すると、その店がどの都道府県に多いかを地図とランキングで表示します。</p>
          )}
          {state === "error" && (
            <div className="space-y-3">
              <p className="text-ink">
                {error === "busy" ? "混み合っています。少し待ってもう一度お試しください" : "エラーが発生しました"}
              </p>
              <button type="button" onClick={retry} className="rounded-lg bg-accent px-4 py-2 font-bold text-on-accent">
                もう一度
              </button>
            </div>
          )}
          {result && state !== "error" && <RankingPanel
              result={result}
              onSearch={search}
              onHqChange={onHqChange}
              showMissing={showMissing}
              onToggleMissing={() => setMissingFor(showMissing ? null : result.query)}
            />}
        </aside>
      </main>

      <footer className="text-xs text-muted">
        地図・店舗データ © OpenStreetMap contributors（ODbL）／ 都道府県境界：地球地図日本 ／ 候補：Name Suggestion Index
      </footer>
    </div>
  );
}
