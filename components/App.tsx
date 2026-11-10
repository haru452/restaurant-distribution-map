"use client";
// 画面全体：検索欄、地図、ランキング
import { RankingPanel } from "./RankingPanel";
import { SearchBar } from "./SearchBar";
import { useSearch } from "./useSearch";

export function App() {
  const { state, result, error, search, retry } = useSearch();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 lg:py-6">
      <header className="space-y-3">
        <h1 className="text-xl font-bold text-ink lg:text-2xl">レストラン分布マップ</h1>
        <SearchBar onSearch={search} disabled={state === "loading"} />
      </header>

      <main className="flex flex-1 flex-col gap-4 lg:flex-row">
        <section aria-label="地図" className="relative h-[55vh] min-h-[320px] overflow-hidden rounded-xl border border-line bg-surface lg:h-auto lg:min-h-[560px] lg:flex-1">
          {/* 地図は Task 9 で入る */}
          <div className="flex h-full items-center justify-center text-muted">地図</div>
          {state === "loading" && (
            <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-1 bg-surface/70 text-ink backdrop-blur-sm">
              <p className="font-bold">検索中…</p>
              <p className="text-sm text-muted">初めての店は時間がかかることがあります</p>
            </div>
          )}
        </section>

        <aside aria-label="都道府県ランキング" className="rounded-xl border border-line bg-surface p-4 lg:w-80 lg:overflow-y-auto">
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
          {result && state !== "error" && <RankingPanel result={result} onSearch={search} />}
        </aside>
      </main>

      <footer className="text-xs text-muted">
        地図・店舗データ © OpenStreetMap contributors（ODbL）／ 都道府県境界：地球地図日本 ／ 候補：Name Suggestion Index
      </footer>
    </div>
  );
}
