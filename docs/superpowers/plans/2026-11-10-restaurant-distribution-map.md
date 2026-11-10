# レストラン分布マップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 店名で検索すると、その店の日本国内の分布を「ヒートマップ / 都道府県の色分け / ピン」で切り替えて見られ、都道府県ランキングも出るWebアプリを作る。店データは前もって Supabase に取り込み、Supabase にないときだけ Overpass に問い合わせる。誤字には候補と「もしかして」で対応する。Vercel で公開できる状態にする。

**Architecture:** Next.js（App Router）1プロジェクト、git リポジトリは `map-app/` 単独。`scripts/import-shops.ts` が都道府県ごとに Overpass から飲食店を取り、Supabase の `shops` 表に入れ、`data/brands.json` も作る。`/api/search` は `shops` を `search_key` の部分一致で探し、0件や Supabase 不調なら Overpass に直接問い合わせ、見つかった店を裏で `shops` に足す。画面は Leaflet をブラウザ専用で読み込み、同じ結果から3つの表示を作る。

**Tech Stack:** Next.js 16（App Router、TypeScript、Tailwind）、Vitest、tsx、Leaflet、leaflet.heat、leaflet.markercluster、@turf/boolean-point-in-polygon、@turf/bbox、@supabase/supabase-js、@vercel/functions

**Spec:** `docs/superpowers/specs/2026-11-10-restaurant-distribution-map-design.md`

## Global Constraints

- git リポジトリは `map-app/` 単独。`es` リポジトリには何もコミットしない
- 1ファイル600行以内
- Next.js 16 は学習データと違う点がある。route handler、`next/dynamic`、`vercel.json` の cron を書く前に `node_modules/next/dist/docs/` の該当ガイドを読む（`AGENTS.md`）
- 店のデータ元は OpenStreetMap だけ。対象は日本国内のみ
- 店の上限は 5,000件。超えたら先頭5,000件と `truncated: true`
- 成功時のヘッダー：`Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`。エラー時は `Cache-Control: no-store`
- `export const maxDuration = 60`（search の route.ts）、検索時の Overpass は `[timeout:50]`、取り込み時は `[timeout:300]`
- Supabase：表 `shops`、環境変数 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（`NEXT_PUBLIC_` を付けない。画面側のコードから import しない）。Supabase の読み出しは5秒で打ち切り、失敗でアプリを止めない
- 地図には `© OpenStreetMap contributors`、地球地図日本、Name Suggestion Index の出典を出す
- 画面の文言は spec の文言をそのまま使う：「店名を入力してください」「見つかりませんでした。カタカナや英語の表記も試してください」「混み合っています。少し待ってもう一度お試しください」「件数が多いため一部のみ表示しています」「エラーが発生しました」「もしかして：」
- シェルの heredoc はバックスラッシュを壊すことがある。`\` を含むファイルは Write/Edit ツールで書く

## Review Focus

1. **ひらがな表記の店（すき家 など）** — Supabase 検索でも Overpass 検索でも、「すき家」「スキ家」どちらの入力でも見つかるべき。→ Task 3 `buildPattern: かなを両方に一致させる`、Task 4 `search_key は looseKey を使う`
2. **Supabase で見つかったが件数が1,000件ちょうどなどの境目** — 1,000件ずつの取得で取りこぼさず、5,001件で止めるべき。→ Task 6 `searchShops: 1000件ずつ取り 5001件で止める`
3. **`like` を壊す入力（`%`、`_`、`\`）** — 「100%」で全件一致にならないべき。→ Task 6 `escapeLike`
4. **Supabase が一時停止・遅い** — 5秒で諦めて Overpass で続けるべき。→ Task 6 `Supabase 失敗なら Overpass で返す`
5. **新しい検索の直後に古い検索の返事が届く** — 最後の操作の結果だけが表示されるべき。→ Task 8 の `useSearch` の AbortController と目視確認

---

### Task 1: プロジェクト作成と検索語の正規化（完了）

**Produces:** `lib/types.ts`（`Shop`, `PrefectureCount`, `SearchResult`, `RawShop`, `Brand`）、`lib/normalize.ts`（`normalizeQuery`, `isValidQuery`, `looseKey`, `hiraganaToKatakana`）

### Task 2: 都道府県の判定と集計（完了）

**Produces:** `lib/prefecture.ts`（`findPrefecture`, `assignPrefectures`, `countByPrefecture`, `UNKNOWN_PREFECTURE`）、`data/prefectures.json`（47件、`properties.name`）

### Task 3: Overpass への問い合わせ（完了）

**Produces:** `lib/overpass.ts`（`OVERPASS_URL`, `USER_AGENT`, `AMENITIES`, `AMENITY_REGEX`, `MAX_SHOPS`, `OverpassBusyError`, `buildPattern`, `buildQuery`, `parseElements`, `runOverpass(query, fetchImpl)`, `fetchShops`）

---

### Task 4: 型の変更と Overpass 結果の保存用情報

**Files:**
- Modify: `lib/types.ts`, `lib/overpass.ts`, `lib/overpass.test.ts`

**Interfaces:**
- Produces:
  - `SearchResult` に `source: "db" | "live"` を追加
  - `type OsmShop = RawShop & { osmId: string; brand?: string; searchKey: string }`（`lib/types.ts`）
  - `parseElements(json): OsmShop[]` — `osmId` は `` `${type}/${id}` ``、`brand` は `tags.brand`、`searchKey` は `name` / `name:ja` / `brand` / `brand:ja` のうちあるものの `looseKey` を重複なしで `|` でつないだもの
  - `fetchShops(...)` の戻り値の `shops` は `OsmShop[]`
  - `toRawShop(s: OsmShop): RawShop` — 画面に返す前に保存用の項目を落とす

- [ ] **Step 1:** 既存の `parseElements` テストを新しい形に直し、追加：`search_key は looseKey を使う`（`{ name: "すき家 渋谷店", brand: "すき家" }` → `searchKey` が `"スキ家渋谷店|スキ家"`）、`osmId` が `"node/1"` / `"way/2"`
- [ ] **Step 2:** `npx vitest run` → FAIL
- [ ] **Step 3:** 実装
- [ ] **Step 4:** `npx vitest run` → PASS、`npx tsc --noEmit` → エラーなし
- [ ] **Step 5: Commit** — `feat: Overpass結果に保存用の情報を追加`

---

### Task 5: 候補探しと支店名の取り出し

**Files:**
- Create: `lib/suggest.ts`, `lib/brandName.ts`
- Test: `lib/suggest.test.ts`, `lib/brandName.test.ts`

**Interfaces:**
- Consumes: `Brand`, `looseKey`
- Produces:
  - `suggest(input: string, brands: Brand[], limit = 5): Brand[]` — `looseKey(input)` が1文字以下なら `[]`。各 Brand は `name` と `aliases` のうち一番よい一致で評価。順位：先頭一致 → 途中に含まれる → 編集距離（入力の looseKey 長 ≤4 なら ≤1、それ以上なら ≤2。相手は looseKey 全体と、先頭から入力と同じ長さ±1 の部分のうち一番近いもの）。同順位は「入力と相手の looseKey 全体との編集距離」が小さい順 → `count` の多い順 → 名前の短い順
  - `stripBranch(name: string): string` — 半角空白・全角空白・「・」で区切った末尾が `/店$/` なら取る（取った結果が空なら元のまま）
  - `mergeUnseparated(counts: Map<string, number>): Map<string, number>` — 区切りなしで `店` で終わる名前のうち、ほかの名前（3文字以上）が先頭に一致するものを、最も長く一致する名前に件数ごとまとめる
  - `aggregateBrands(shops: { name: string; brand?: string }[], nsi: Brand[], minCount = 3): Brand[]` — spec「候補の一覧」の2〜3。`count` の多い順

- [ ] **Step 1: 失敗するテストを書く**

```ts
const brands: Brand[] = [
  { name: "サイゼリヤ", aliases: ["Saizeriya"], count: 900 },
  { name: "マクドナルド", aliases: ["McDonald's"], count: 2900 },
  { name: "スシロー", aliases: [], count: 600 },
  { name: "スシローコノミ", aliases: [], count: 3 },
  { name: "すき家", aliases: ["Sukiya"], count: 1900 },
];
expect(suggest("サイゼリア", brands)[0].name).toBe("サイゼリヤ");
expect(suggest("マクドナルト", brands)[0].name).toBe("マクドナルド");
expect(suggest("すしろ", brands)[0].name).toBe("スシロー");
expect(suggest("すきや", brands)[0].name).toBe("すき家");   // スキヤ と スキ家 は距離1
expect(suggest("mcdonald", brands)[0].name).toBe("マクドナルド");
expect(suggest("あいうえおかき", brands)).toEqual([]);
expect(suggest("す", brands)).toEqual([]);

expect(stripBranch("スシロー 渋谷店")).toBe("スシロー");
expect(stripBranch("スシロー・本店")).toBe("スシロー");
expect(stripBranch("スシロー渋谷店")).toBe("スシロー渋谷店");
const merged = mergeUnseparated(new Map([["スシロー", 5], ["スシロー渋谷店", 1], ["喫茶ルノアール", 4]]));
expect(merged.get("スシロー")).toBe(6);
expect(merged.has("スシロー渋谷店")).toBe(false);

const agg = aggregateBrands(
  [
    { name: "スシロー 渋谷店" }, { name: "スシロー 新宿店" }, { name: "スシロー渋谷店" },
    { name: "なにか", brand: "すき家" }, { name: "x", brand: "すき家" }, { name: "y", brand: "すき家" }, { name: "z", brand: "すき家" },
    { name: "個人店" },
  ],
  [{ name: "すき家", aliases: ["Sukiya"], count: 0 }],
);
expect(agg).toEqual([
  { name: "すき家", aliases: ["Sukiya"], count: 4 },
  { name: "スシロー", aliases: [], count: 3 },
]);
```

- [ ] **Step 2:** `npx vitest run` → FAIL
- [ ] **Step 3:** 実装（編集距離は自前の Levenshtein。依存ライブラリは足さない）
- [ ] **Step 4:** `npx vitest run` → PASS
- [ ] **Step 5: Commit** — `feat: 誤字の候補探しとチェーン名の集計`

---

### Task 6: Supabase の店テーブルと検索API

**Files:**
- Create: `supabase/schema.sql`, `.env.example`, `lib/shopStore.ts`, `lib/search.ts`, `app/api/search/route.ts`, `app/api/keepalive/route.ts`, `vercel.json`
- Test: `lib/shopStore.test.ts`, `lib/search.test.ts`

**Interfaces:**
- Consumes: Task 1〜4
- Produces:
  - `supabase/schema.sql` — spec の SQL のとおり
  - `type ShopRow = { osm_id: string; name: string; brand: string | null; lat: number; lon: number; address: string | null; prefecture: string; search_key: string; updated_at?: string }`
  - `escapeLike(s: string): string` — `\` `%` `_` の前に `\`
  - `type ShopStore = { search(key: string): Promise<Shop[]>; upsert(shops: (OsmShop & { prefecture: string })[], updatedAt?: Date): Promise<void>; deleteOlderThan(t: Date): Promise<number>; ping(): Promise<void> }`
  - `createShopStore(client?: SupabaseClient): ShopStore | null` — 引数なしなら環境変数から作り、なければ `null`
  - `searchShops` の実装：`.from("shops").select("name,lat,lon,address,prefecture").like("search_key", `%${escapeLike(key)}%`).order("osm_id").range(from, from+999)` を 1,000件未満が返るか 5,001件に達するまで繰り返す。全体を5秒で打ち切る（超えたら例外）
  - `upsert` は 1,000件ずつ `upsert(rows, { onConflict: "osm_id" })`
  - `handleSearch(rawQuery: string | null, deps: { store: ShopStore | null; fetchShops: typeof fetchShops; background: (p: Promise<unknown>) => void }): Promise<{ status: number; body: SearchResult | { error: string }; cacheable: boolean }>`
  - `GET /api/search?q=...` — `deps` に本物（`background` は `@vercel/functions` の `waitUntil`）を渡して `Response.json`
  - `GET /api/keepalive` — `store?.ping()`。成功 200、失敗 500、store なし 204
  - `vercel.json` — `{ "crons": [{ "path": "/api/keepalive", "schedule": "0 3 * * *" }] }`

| 状況 | status | body | 裏で upsert |
|---|---|---|---|
| q なし・不正 | 400 | `{ error: "invalid_query" }` | しない |
| Supabase で1件以上 | 200 | `source: "db"` | しない |
| Supabase 0件 → Overpass で1件以上 | 200 | `source: "live"` | する（都道府県は `findPrefecture`） |
| Supabase 失敗・null → Overpass で1件以上 | 200 | `source: "live"` | store があればする |
| 両方0件 | 200 | `total: 0`, `source: "live"` | しない |
| Supabase 0件・失敗 → OverpassBusyError | 503 | `{ error: "busy" }` | しない |
| その他 | 500 | `{ error: "internal" }` | しない |

`cacheable` は 200 のとき true。Supabase で見つかったときは `truncated` を「5,001件取れたか」で決め、先頭5,000件を返す。

- [ ] **Step 1: 失敗するテストを書く**
  - `shopStore.test.ts`：`escapeLike("100%_a\\b")` が `"100\\%\\_a\\\\b"`。偽の Supabase クライアント（`from().select().like().order().range()` を記録して、2,500件の行を範囲で切って返す／6,000件のときは5,001件で止まる）で `searchShops: 1000件ずつ取り 5001件で止める`
  - `search.test.ts`：上の表の各行（偽の `ShopStore`・`fetchShops`、`background` は渡された Promise を配列に積む）。`Supabase 失敗なら Overpass で返す`（`search` が reject）、`query` が正規化後の値、`byPrefecture` が入る
- [ ] **Step 2:** `npx vitest run` → FAIL
- [ ] **Step 3:** 実装（`npm i @supabase/supabase-js @vercel/functions`）。route handler と `vercel.json` の前に `node_modules/next/dist/docs/` の route handler の項を読む
- [ ] **Step 4:** `npx vitest run` → PASS、`npx tsc --noEmit` → エラーなし、`npm run build` → 成功
- [ ] **Step 5:** `.env.local` なしで `npm run dev`、`curl -i "http://localhost:3000/api/search?q=%21"` → 400
- [ ] **Step 6: Commit** — `.env.local` が入っていないことを確認 → `feat: Supabaseの店テーブルと検索API`

---

### Task 7: 取り込みスクリプト

**Files:**
- Create: `scripts/import-shops.ts`, `lib/importQuery.ts`, `data/LICENSE-brands.md`
- Test: `lib/importQuery.test.ts`
- Modify: `package.json`（`"import-shops": "tsx --env-file=.env.local scripts/import-shops.ts"`）

**Interfaces:**
- Consumes: `runOverpass`, `parseElements`, `AMENITY_REGEX`（Task 3/4）、`createShopStore`（Task 6）、`aggregateBrands`（Task 5）、`data/prefectures.json` の都道府県名
- Produces:
  - `buildPrefectureQuery(prefecture: string): string` — `[out:json][timeout:300];area["name"="<県名>"]["admin_level"="4"]->.p;nwr(area.p)["amenity"~"<AMENITY_REGEX>"][~"^(name|name:ja|brand|brand:ja)$"~"."];out center tags;`
  - `fetchNsiBrands(fetchImpl?): Promise<Brand[]>` — spec「候補の一覧」1。`https://raw.githubusercontent.com/osmlab/name-suggestion-index/main/data/brands/amenity/<amenity>.json`
  - スクリプト本体：spec「取り込み」1〜5。`--only=東京都` で1県だけ取り込める（試し用）。`--only` のときは古い行の削除と brands.json の作成をしない

- [ ] **Step 1: 失敗するテストを書く**：`buildPrefectureQuery("東京都")` が `area["name"="東京都"]["admin_level"="4"]` と `[timeout:300]` と `out center tags;` を含む。`fetchNsiBrands` に偽の fetch（`locationSet.include` が `["jp"]` の項目と `["us"]` の項目）を渡し、jp の項目だけが返る
- [ ] **Step 2:** `npx vitest run` → FAIL
- [ ] **Step 3:** 実装。Overpass 呼び出しは `runOverpass` に取り込み用の長いタイムアウト（10分）を渡せるようにする（`runOverpass(query, fetchImpl, timeoutMs = 55_000)` に拡張）
- [ ] **Step 4:** `npx vitest run` → PASS
- [ ] **Step 5:** `data/LICENSE-brands.md` に NSI（BSD-3-Clause）と OSM（ODbL）の出典を書く
- [ ] **Step 6: Commit** — `feat: 飲食店の取り込みスクリプト`
- [ ] 実際の取り込みは Task 10（Supabase の準備の後）

---

### Task 8: 画面（検索欄・候補・ランキング・状態表示）

**Files:**
- Create: `components/SearchBar.tsx`, `components/RankingPanel.tsx`, `components/useSearch.ts`
- Modify: `app/page.tsx`, `app/layout.tsx`（`lang="ja"`、タイトル「レストラン分布マップ」）

**Interfaces:**
- Consumes: `GET /api/search`、`normalizeQuery`, `isValidQuery`, `suggest`, `data/brands.json`（Task 10 で中身が入るまでは `[]`）、`SearchResult`
- Produces:
  - `useSearch(): { state: "idle" | "loading" | "done" | "error"; result?: SearchResult; error?: "busy" | "internal"; search(q: string): void; retry(): void }` — `normalizeQuery` を通して `q` を作る。新しい検索の前に前の fetch を AbortController で止める
  - `<SearchBar onSearch={(q: string) => void} disabled={boolean} />` — 入力から150ms後に `suggest(input, brands, 5)`。↑↓で選択、Enter で選択中の候補（なければ入力）を検索、Esc で閉じる、タップで選択。`role="combobox"` / `role="listbox"` / `aria-activedescendant`。不正入力は送らず「店名を入力してください」。`brands.json` は最初の入力時に動的 import
  - `<RankingPanel result={SearchResult} onSearch={(q: string) => void} />` — 「全国 N店」、都道府県ランキング（件数の横棒）、`truncated` の注意文。`total === 0` なら「見つかりませんでした…」と「もしかして：」＋ `suggest(result.query, brands, 3)` のボタン
  - `app/page.tsx`：`lg` 以上は地図とランキングを横並び、未満は縦並び。地図の場所は Task 9 まで仮の枠。idle は使い方の案内、busy/internal は再試行ボタン、loading は「検索中…」（`source` が live になりうるので「初めての店は時間がかかることがあります」も添える）

- [ ] **Step 1:** 実装
- [ ] **Step 2:** `npm run build` → 成功、`npx vitest run` → PASS
- [ ] **Step 3: 目視確認**（`npm run dev`）：「！」は送信されない／幅375pxで横スクロールが出ない／候補はキーボードとタップで選べる（brands.json が空の間は、仮の数件で確認して戻す）
- [ ] **Step 4: Commit** — `feat: 検索欄・候補・ランキング`

---

### Task 9: 地図と3つの表示

**Files:**
- Create: `components/MapView.tsx`, `components/layers/HeatLayer.tsx`, `components/layers/ChoroplethLayer.tsx`, `components/layers/PinLayer.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `SearchResult`、`data/prefectures.json`
- Produces:
  - `type ViewMode = "heat" | "choropleth" | "pins"`（初期値 `"heat"`）
  - `<MapView result={SearchResult | undefined} />` — page から `next/dynamic` の `ssr: false` で読み込む（Next.js 16 のガイドを先に読む）。中心 `[37.5, 137.5]`、ズーム5（幅640px未満は4）。右上に「ヒートマップ / 都道府県 / ピン」。表示中の1つだけ描く。新しい結果で全店が入る範囲へ `fitBounds`（0件なら日本全体）
  - 各レイヤー：`({ map, result }: { map: L.Map; result: SearchResult }) => null`、アンマウント時に自分のレイヤーを外す
    - Heat：`leaflet.heat`、点は `[lat, lon, 1]`
    - Choropleth：`prefectures.json` を選んだときだけ動的 import。0件は塗らない、それ以外は件数で5段階。県タップで「○○県 N店」
    - Pins：`leaflet.markercluster`、ポップアップは店名と住所（あれば）。`L.Icon.Default` の画像パスを明示設定
  - 右下に出典（OSM、地球地図日本、NSI）

- [ ] **Step 1:** `npm i leaflet leaflet.heat leaflet.markercluster` と `@types/leaflet` `@types/leaflet.markercluster`（`leaflet.heat` に型がなければ `types/leaflet-heat.d.ts`）
- [ ] **Step 2:** 実装
- [ ] **Step 3:** `npm run build` → 成功（`window is not defined` が出ない）
- [ ] **Step 4: 目視確認**：Supabase なしでも Overpass が空いていれば結果が出る場合があるので、出なければ偽の結果（固定の `SearchResult`）を一時的に流して3表示・ピン・県のタップ・幅375px/PC を確認し、戻す
- [ ] **Step 5: Commit** — `feat: 地図と3つの表示`

---

### Task 10: Supabase の準備、取り込み、公開

**Files:** `README.md`（書き換え）、`data/brands.json`（生成）

- [ ] **Step 1:** `README.md`：起動方法、環境変数、`supabase/schema.sql` の実行方法、`npm run import-shops` の使いどころ（月1回、`--only=県名` で試せる）、keepalive、出典とライセンス
- [ ] **Step 2: 利用者の作業をお願いする**：Supabase のプロジェクト作成、SQL Editor で `schema.sql` を実行、`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を `.env.local` に設定
- [ ] **Step 3:** `npm run import-shops -- --only=東京都` → Supabase の `shops` に行が入る。`npm run dev` で「スシロー」が1秒程度で `source: "db"` で出る
- [ ] **Step 4:** `npm run import-shops`（全国、1時間前後）→ `data/brands.json` ができる。件数・サイズ・上位20件を表示し、「スシロー」「サイゼリヤ」「すき家」が入っていることを確認。1MB を超えたら `minCount` を5に上げて作り直す。Commit — `data: 候補用のチェーン店名一覧`
- [ ] **Step 5:** 公開の方法を利用者と決める（GitHub に新しいリポジトリを作って Vercel と連携、または `npx vercel`）。Vercel の環境変数に2つを設定
- [ ] **Step 6: 公開後の確認**：「スシロー」がすぐ出る／2回目で `x-vercel-cache: HIT`／Supabase にない店名で調べた後、`shops` に行が増える／Vercel の Cron Jobs 画面に keepalive が出る／スマホ表示で spec の目視確認項目を通しで
