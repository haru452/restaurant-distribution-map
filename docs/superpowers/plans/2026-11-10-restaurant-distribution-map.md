# レストラン分布マップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 店名で検索すると、その店の日本国内の分布を「ヒートマップ / 都道府県の色分け / ピン」で切り替えて見られ、都道府県ランキングも出るWebアプリを作る。誤字には候補と「もしかして」で対応し、一度調べた結果は Supabase に保存してすぐ返す。Vercel で公開できる状態にする。

**Architecture:** Next.js（App Router）1プロジェクト。`/api/search` は Supabase の保存結果を先に見て、なければ Overpass API に問い合わせ、都道府県ごとに数えて JSON を返す（CDN 1日キャッシュ＋Supabase 30日で裏更新）。画面は Leaflet をブラウザ専用で動的読み込みし、同じ結果から3つの表示を作る。誤字候補は、スクリプトで作ってコミットした `data/brands.json` をもとにブラウザ内で計算する。

**Tech Stack:** Next.js（create-next-app@latest、TypeScript、App Router、Tailwind）、Vitest、tsx（スクリプト実行）、Leaflet、leaflet.heat、leaflet.markercluster、@turf/boolean-point-in-polygon、@turf/bbox、@supabase/supabase-js、@vercel/functions

**Spec:** `docs/superpowers/specs/2026-11-10-restaurant-distribution-map-design.md`

## Global Constraints

- プロジェクトのルートは `map-app/`（git リポジトリのルートは1つ上の `es/`）。コミットは自分が作ったファイルのパスだけを `git add` する。`es/` 配下の既存の未コミット変更（削除など）に触れない
- 1ファイル600行以内
- 店のデータ元は OpenStreetMap（Overpass API: `https://overpass-api.de/api/interpreter`）だけ。対象は日本国内のみ
- 店の上限は 5,000件。超えたら先頭5,000件と `truncated: true`
- 成功時のヘッダー：`Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`。エラー時は `Cache-Control: no-store`
- `export const maxDuration = 60`（route.ts）、Overpass の `[timeout:50]`
- 対象の `amenity`：`restaurant|fast_food|cafe|food_court|pub|bar`
- 検索対象タグ：`name` / `name:ja` / `brand` / `brand:ja`（大文字小文字を区別しない）
- Overpass へのリクエストには `User-Agent: restaurant-distribution-map/1.0` を付ける（個人情報は入れない）
- Supabase：表 `search_results`、環境変数 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（`NEXT_PUBLIC_` を付けない。画面側のコードから import しない）。保存の鮮度は30日。0件は保存しない。Supabase の失敗でアプリを止めない
- 地図には `© OpenStreetMap contributors`、都道府県境界データ、Name Suggestion Index（BSD-3-Clause）の出典を出す
- 画面の文言は日本語。spec の文言をそのまま使う：
  - 「店名を入力してください」
  - 「見つかりませんでした。カタカナや英語の表記も試してください」
  - 「混み合っています。少し待ってもう一度お試しください」
  - 「件数が多いため一部のみ表示しています」
  - 「エラーが発生しました」
  - 「もしかして：」

## Review Focus

1. **ひらがな表記の店（すき家、なか卯 など）** — OSM の店名が「すき家」のとき、「すき家」と入力しても「スキ家」と入力しても見つかるべき。→ Task 3 のテスト `buildPattern: かなを両方に一致させる`
2. **Overpass が 200 で `remark` に時間切れを返す** — 0件扱いにせず 503（混雑）にし、Supabase にも保存しないべき。→ Task 3 `fetchShops: remark の時間切れは OverpassBusyError`、Task 6 `Busy は保存しない`
3. **正規表現・Overpass QL を壊す文字（`"`、`\`、`(`、`.`、`+`）** — 例「C&C」「ラーメン(仮)」で検索が壊れないべき。→ Task 3 `buildPattern: 特殊文字を無害化する`
4. **Supabase が一時停止・遅い** — 3秒で諦めて Overpass で続けるべき。→ Task 6 `store の読み出しが失敗しても Overpass で返す`
5. **候補の一覧にある名前を候補から選んだ直後に、古い入力の候補や検索結果が上書きする** — 最後の操作の結果だけが表示されるべき。→ Task 7 の `useSearch` の AbortController と、目視確認項目

---

### Task 1: プロジェクト作成と検索語の正規化

**Files:**
- Create: `map-app/` 一式（create-next-app）、`vitest.config.ts`
- Create: `lib/types.ts`, `lib/normalize.ts`
- Test: `lib/normalize.test.ts`

**Interfaces:**
- Produces:
  - `lib/types.ts`:
    ```ts
    export type Shop = { name: string; lat: number; lon: number; address?: string; prefecture: string };
    export type PrefectureCount = { prefecture: string; count: number };
    export type SearchResult = { query: string; total: number; truncated: boolean; shops: Shop[]; byPrefecture: PrefectureCount[] };
    export type RawShop = Omit<Shop, "prefecture">;
    export type Brand = { name: string; aliases: string[]; count: number };
    ```
  - `normalizeQuery(input: string): string` — trim、NFKC（全角英数→半角）、ひらがな→カタカナ（U+3041–U+3096 を +0x60）、連続空白を1つに
  - `isValidQuery(normalized: string): boolean` — `\p{L}|\p{N}` を1つ以上含めば true
  - `looseKey(input: string): string` — `normalizeQuery` のあと「ー」を除き、小さいカナ（ァィゥェォッャュョヮヵヶ）を大きいカナに、英字を小文字に、空白を除く。候補探しの比較用

- [ ] **Step 1: プロジェクトを作る**

`es/map-app/` で `npx create-next-app@latest . --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm`（既存の `docs/` `.claude/` で止まる場合は一時フォルダに作って移す）。`npm i -D vitest tsx`、`package.json` に `"test": "vitest run"`。`vitest.config.ts` は `@` → ルートの alias だけ。`.gitignore` に `.env.local` が入っていることを確認。

- [ ] **Step 2: 失敗するテストを書く** `lib/normalize.test.ts`

```ts
expect(normalizeQuery("  すしろー ")).toBe("スシロー");
expect(normalizeQuery("ＭＯＳ　バーガー")).toBe("MOS バーガー");
expect(normalizeQuery("すき家")).toBe("スキ家");
expect(isValidQuery(normalizeQuery("！？"))).toBe(false);
expect(isValidQuery(normalizeQuery("   "))).toBe(false);
expect(isValidQuery(normalizeQuery("C&C"))).toBe(true);
expect(looseKey("サイゼリャ")).toBe(looseKey("さいぜりや"));
expect(looseKey("スシロー")).toBe("スシロ");
expect(looseKey("Mos Burger")).toBe("mosburger");
```

- [ ] **Step 3:** `npm test` → FAIL
- [ ] **Step 4:** 実装
- [ ] **Step 5:** `npm test` → PASS、`npm run build` → 成功
- [ ] **Step 6: Commit** — `git status` で `node_modules` `.next` が出ていないことを確認してから `git add map-app/` 以下の新規ファイル → `feat: Next.jsプロジェクト作成と検索語の正規化`

---

### Task 2: 都道府県の判定と集計

**Files:**
- Create: `data/prefectures.json`, `data/LICENSE-prefectures.md`, `lib/prefecture.ts`
- Test: `lib/prefecture.test.ts`

**Interfaces:**
- Consumes: `RawShop`, `Shop`, `PrefectureCount`
- Produces:
  - `findPrefecture(lat: number, lon: number): string` — 例「東京都」、どれにも入らなければ `"不明"`
  - `assignPrefectures(shops: RawShop[]): Shop[]`
  - `countByPrefecture(shops: Shop[]): PrefectureCount[]` — 件数の多い順、同数は都道府県名順
  - `data/prefectures.json`：FeatureCollection、各 Feature の `properties.name` に都道府県名

- [ ] **Step 1: 境界データを用意**

`https://github.com/dataofjapan/land` の `japan.geojson` を取得し、ライセンスを確認して `data/LICENSE-prefectures.md` に出典とライセンスを書く（使えないライセンスなら止めて報告）。都道府県名のプロパティ（`nam_ja`）を `name` に揃える。1MB を超えるなら `npx mapshaper data/prefectures.json -simplify 10% keep-shapes -o data/prefectures.json`。47件あることを確認。

- [ ] **Step 2: 失敗するテストを書く**

```ts
expect(findPrefecture(35.6812, 139.7671)).toBe("東京都");   // 東京駅
expect(findPrefecture(34.7025, 135.4959)).toBe("大阪府");   // 大阪駅
expect(findPrefecture(43.0687, 141.3508)).toBe("北海道");   // 札幌駅
expect(findPrefecture(26.2058, 127.6465)).toBe("沖縄県");   // 那覇空港付近
expect(findPrefecture(34.0, 139.0)).toBe("不明");           // 海上
const shops = assignPrefectures([
  { name: "A", lat: 35.6812, lon: 139.7671 },
  { name: "B", lat: 35.6895, lon: 139.6917 },
  { name: "C", lat: 34.7025, lon: 135.4959 },
]);
expect(countByPrefecture(shops)).toEqual([
  { prefecture: "東京都", count: 2 },
  { prefecture: "大阪府", count: 1 },
]);
```

- [ ] **Step 3:** `npm test` → FAIL
- [ ] **Step 4:** 実装（`npm i @turf/boolean-point-in-polygon @turf/bbox`）。各 Feature の bbox を読み込み時に1回だけ計算し、bbox に入るものだけ `booleanPointInPolygon` で判定
- [ ] **Step 5:** `npm test` → PASS
- [ ] **Step 6: Commit** — `feat: 都道府県の判定と集計`

---

### Task 3: Overpass への問い合わせ

**Files:**
- Create: `lib/overpass.ts`
- Test: `lib/overpass.test.ts`

**Interfaces:**
- Consumes: `RawShop`
- Produces:
  - `AMENITIES = ["restaurant","fast_food","cafe","food_court","pub","bar"] as const`（Task 5 でも使う）
  - `OVERPASS_URL`, `USER_AGENT` 定数（Task 5 でも使う）
  - `MAX_SHOPS = 5000`
  - `buildPattern(normalized: string): string` — 正規表現の特殊文字 `\ ^ $ . | ? * + ( ) [ ] { }` をエスケープ。カナ1文字を「ひらがな・カタカナ・小さい字/大きい字」の文字クラスに（例 ヤ → `[やヤゃャ]` の4文字を含むクラス）。「ー」は `ー?`
  - `buildQuery(normalized: string): string` — パターンをさらに QL 文字列用に `\` と `"` をエスケープして埋め込む
  - `parseElements(json: unknown): RawShop[]`
  - `fetchShops(normalized: string, fetchImpl?: typeof fetch): Promise<{ shops: RawShop[]; truncated: boolean }>`
  - `class OverpassBusyError extends Error` — 429 / 504 / `remark` に `timed out` か `runtime error` / 中断（AbortError, TimeoutError）。その他の失敗は通常の `Error`

クエリ（`P` は QL 用にエスケープ済みパターン、`A` は `^(restaurant|fast_food|cafe|food_court|pub|bar)$`）:

```
[out:json][timeout:50];
area["ISO3166-1"="JP"][admin_level=2]->.jp;
(
  nwr(area.jp)["amenity"~"A"]["name"~"P",i];
  nwr(area.jp)["amenity"~"A"]["name:ja"~"P",i];
  nwr(area.jp)["amenity"~"A"]["brand"~"P",i];
  nwr(area.jp)["amenity"~"A"]["brand:ja"~"P",i];
);
out center 5001;
```

5,001件返ったら先頭5,000件＋`truncated: true`。住所は `addr:full`、なければ `addr:province, addr:city, addr:quarter, addr:neighbourhood, addr:block_number, addr:housenumber` のあるものを順に連結。どれもなければ `address` なし。名前は `name`、なければ `name:ja`、なければ `brand`。どれもなければ除外。

- [ ] **Step 1: 失敗するテストを書く**

```ts
const re = (q: string) => new RegExp(buildPattern(normalizeQuery(q)), "i");
// buildPattern: かなを両方に一致させる
expect(re("すき家").test("すき家 渋谷店")).toBe(true);
expect(re("スキ家").test("すき家")).toBe(true);
expect(re("サイゼリヤ").test("サイゼリャ")).toBe(true);
expect(re("スシロー").test("スシロ")).toBe(true);
// buildPattern: 特殊文字を無害化する
expect(re("ラーメン(仮).").test("ラーメン(仮).")).toBe(true);
expect(re("ラーメン(仮).").test("ラーメン仮X")).toBe(false);
expect(buildQuery('a"b')).toContain('a\\"b');
expect(buildQuery("スシロー")).toContain("out center 5001;");
// parseElements: name がなければ brand を使う、名前なしは除外、住所の連結
expect(parseElements({ elements: [
  { type: "node", id: 1, lat: 35, lon: 139, tags: { name: "スシロー 渋谷店", "addr:province": "東京都", "addr:city": "渋谷区" } },
  { type: "way", id: 2, center: { lat: 34, lon: 135 }, tags: { brand: "スシロー" } },
  { type: "node", id: 3, lat: 33, lon: 130, tags: {} },
]})).toEqual([
  { name: "スシロー 渋谷店", lat: 35, lon: 139, address: "東京都渋谷区" },
  { name: "スシロー", lat: 34, lon: 135 },
]);
// fetchShops: remark の時間切れは OverpassBusyError
const res = (body: object, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
await expect(fetchShops("スシロー", res({ elements: [], remark: 'runtime error: Query timed out in "query" at line 4 after 51 seconds.' }))).rejects.toBeInstanceOf(OverpassBusyError);
await expect(fetchShops("スシロー", res({}, 429))).rejects.toBeInstanceOf(OverpassBusyError);
const e500 = await fetchShops("スシロー", res({}, 500)).catch((e) => e);
expect(e500).toBeInstanceOf(Error);
expect(e500).not.toBeInstanceOf(OverpassBusyError);
// 5001件なら 5000件と truncated: true
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装。POST `application/x-www-form-urlencoded`、`data=<query>`、`AbortSignal.timeout(55_000)`
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: 実データで1回確認**（テストには入れない）：`npx tsx -e 'import("./lib/overpass.ts").then(async m => console.log((await m.fetchShops("スシロー")).shops.length))'` → 数百件
- [ ] **Step 6: Commit** — `feat: Overpassへの問い合わせ`

---

### Task 4: 候補探しと支店名の取り出し

**Files:**
- Create: `lib/suggest.ts`, `lib/brandName.ts`
- Test: `lib/suggest.test.ts`, `lib/brandName.test.ts`

**Interfaces:**
- Consumes: `Brand`, `looseKey`
- Produces:
  - `suggest(input: string, brands: Brand[], limit = 5): Brand[]` — spec「似ている名前を探す」どおり。`looseKey(input)` が1文字以下なら `[]`。各 Brand は `name` と `aliases` のうち一番よい一致で評価。順位：先頭一致 → 途中に含まれる → 編集距離（入力 looseKey 長 ≤4 なら ≤1、それ以上なら ≤2。比較相手は相手の looseKey の先頭から入力と同じ長さ±1 の部分と全体のうち小さい方）。同順位は「入力と相手の looseKey 全体との編集距離」が小さい順 → `count` の多い順 → 名前の短い順
  - `stripBranch(name: string): string` — 空白・全角空白・「・」で区切った末尾が `/店$/` なら取る。区切りがなければそのまま
  - `mergeUnseparated(names: Map<string, number>): Map<string, number>` — 区切りなしで `店` で終わる名前のうち、ほかの名前（3文字以上）が先頭に一致するものを、最も長く一致する名前に件数ごとまとめる

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
expect(suggest("あいうえおかき", brands)).toEqual([]);
expect(suggest("す", brands)).toEqual([]);
expect(suggest("mcdonald", brands)[0].name).toBe("マクドナルド");

expect(stripBranch("スシロー 渋谷店")).toBe("スシロー");
expect(stripBranch("スシロー・本店")).toBe("スシロー");
expect(stripBranch("スシロー渋谷店")).toBe("スシロー渋谷店");
expect(stripBranch("喫茶 店")).toBe("喫茶");
const merged = mergeUnseparated(new Map([["スシロー", 5], ["スシロー渋谷店", 1], ["喫茶ルノアール", 4]]));
expect(merged.get("スシロー")).toBe(6);
expect(merged.has("スシロー渋谷店")).toBe(false);
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装（編集距離は通常の Levenshtein を自前で。依存ライブラリは足さない）
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: Commit** — `feat: 誤字の候補探しと支店名の取り出し`

---

### Task 5: 候補一覧 `data/brands.json` の生成

**Files:**
- Create: `scripts/build-brands.ts`, `data/brands.json`, `data/LICENSE-brands.md`
- Modify: `package.json`（`"build-brands": "tsx scripts/build-brands.ts"`）

**Interfaces:**
- Consumes: `stripBranch`, `mergeUnseparated`（Task 4）、`AMENITIES`, `OVERPASS_URL`, `USER_AGENT`（Task 3）、`normalizeQuery`, `looseKey`（Task 1）、`data/prefectures.json` の都道府県名
- Produces: `data/brands.json`（`Brand[]`、`count` の多い順）

処理（spec「候補の一覧」どおり）:
1. NSI：`https://raw.githubusercontent.com/osmlab/name-suggestion-index/main/data/brands/amenity/<amenity>.json` を `AMENITIES` 分取得。`items` のうち `locationSet.include` に `"jp"` を含むものの `tags.name` / `name:ja` / `brand` / `brand:ja` / `name:en` を集め、`name` は `name:ja` → `brand:ja` → `name` の順で最初にあるもの、残りを `aliases`
2. OSM：都道府県ごとに `area["name"="<都道府県名>"]["admin_level"="4"]` で対象 amenity を `out tags;`。1回ごとに5秒空ける。429/504 は30秒待って最大3回やり直す
3. 店名：`brand` があればそれ、なければ `stripBranch(name)`。`mergeUnseparated` をかけ、`count >= 3` だけ残す
4. 1と3を `looseKey` が同じものでまとめ（NSI の `name` を優先、`count` は OSM の数）、`count` の多い順で保存。進み具合を都道府県ごとに表示

- [ ] **Step 1:** 実装
- [ ] **Step 2:** `npm run build-brands` を実行（数十分）。終わったら `data/brands.json` の件数・ファイルサイズ・上位20件を表示して、「スシロー」「サイゼリヤ」「すき家」が入っていることを確認。1MB を超えたら `count >= 5` に上げて作り直す
- [ ] **Step 3:** `data/LICENSE-brands.md` に NSI（BSD-3-Clause）と OSM（ODbL）の出典を書く
- [ ] **Step 4: Commit** — `feat: 候補用のチェーン店名一覧`

---

### Task 6: 結果の保存（Supabase）と検索API

**Files:**
- Create: `supabase/schema.sql`, `.env.example`, `lib/store.ts`, `lib/search.ts`, `app/api/search/route.ts`
- Test: `lib/search.test.ts`

**Interfaces:**
- Consumes: Task 1〜3 の関数
- Produces:
  - `supabase/schema.sql` — spec のとおり
  - `type Store = { get(query: string): Promise<{ result: SearchResult; updatedAt: Date } | null>; save(query: string, result: SearchResult): Promise<void> }`
  - `createSupabaseStore(): Store | null` — 環境変数がなければ `null`。`get` は3秒で打ち切り。失敗は `get` なら `null` を返し、`save` なら握りつぶしてログ（`console.warn`）
  - `handleSearch(rawQuery: string | null, deps: { fetchShops: typeof fetchShops; store: Store | null; now: () => Date; background: (p: Promise<unknown>) => void }): Promise<{ status: number; body: SearchResult | { error: string }; cacheable: boolean }>`
  - `GET /api/search?q=...` — `deps` に本物（`background` は `@vercel/functions` の `waitUntil`）を渡し、`cacheable` に応じたヘッダーで `Response.json`。`export const maxDuration = 60`

| 状況 | status | body | cacheable | 保存 |
|---|---|---|---|---|
| q なし・不正 | 400 | `{ error: "invalid_query" }` | false | しない |
| 保存あり・30日以内 | 200 | 保存した結果 | true | しない |
| 保存あり・30日超 | 200 | 保存した結果 | true | background で調べ直して上書き |
| 保存なし・1件以上 | 200 | 新しい結果 | true | background で保存 |
| 保存なし・0件 | 200 | `total: 0` | true | しない |
| OverpassBusyError | 503 | `{ error: "busy" }` | false | しない |
| その他 | 500 | `{ error: "internal" }` | false | しない |

- [ ] **Step 1: 失敗するテストを書く**（偽の `fetchShops` と、メモリ上の `Store`、固定の `now`）：上の表の各行。加えて
  - `Busy は保存しない`
  - `store の読み出しが失敗しても Overpass で返す`（`get` が reject する Store を渡しても 200）
  - `store が null でも動く`
  - 返す `query` が正規化後の値、`byPrefecture` が入っている、`truncated` が引き継がれる
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装（`npm i @supabase/supabase-js @vercel/functions`）。`handleSearch` は `get` の例外も自分で捕まえる
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** `.env.local` なしで `npm run dev` → `curl "http://localhost:3000/api/search?q=%E3%81%99%E3%81%97%E3%82%8D%E3%83%BC"` が 200、`curl -i ".../api/search?q=%21"` が 400
- [ ] **Step 6: Commit** — `.env.local` が含まれていないことを確認 → `feat: 検索APIとSupabaseへの結果の保存`

---

### Task 7: 画面（検索欄・候補・ランキング・状態表示）

**Files:**
- Create: `components/SearchBar.tsx`, `components/RankingPanel.tsx`, `components/useSearch.ts`
- Modify: `app/page.tsx`, `app/layout.tsx`（`lang="ja"`、タイトル「レストラン分布マップ」）

**Interfaces:**
- Consumes: `GET /api/search`、`normalizeQuery`, `isValidQuery`, `suggest`, `data/brands.json`、`SearchResult`
- Produces:
  - `useSearch(): { state: "idle" | "loading" | "done" | "error"; result?: SearchResult; error?: "busy" | "internal"; search(q: string): void; retry(): void }` — `normalizeQuery` を通して `q` を作る。新しい検索の前に前の fetch を AbortController で止める
  - `<SearchBar onSearch={(q: string) => void} disabled={boolean} />` — 入力から150ms後に `suggest(input, brands, 5)` で候補を表示。↑↓で選択、Enter で選択中の候補（なければ入力）を検索、Esc で閉じる、タップで選択。`role="combobox"` / `role="listbox"` / `aria-activedescendant`。不正入力は送らず「店名を入力してください」。`brands.json` は SearchBar で動的 import（最初の入力時）
  - `<RankingPanel result={SearchResult} onSearch={(q: string) => void} />` — 「全国 N店」、都道府県ランキング（件数の横棒）、`truncated` の注意文。`total === 0` なら「見つかりませんでした…」と「もしかして：」＋ `suggest(result.query, brands, 3)` のボタン（押すと `onSearch`）
  - `app/page.tsx`：`lg` 以上は地図とランキングを横並び、未満は縦並び。地図の場所は Task 8 まで仮の枠。idle は使い方の案内、busy/internal は再試行ボタン

- [ ] **Step 1:** 実装
- [ ] **Step 2:** `npm run build` → 成功、`npm test` → PASS
- [ ] **Step 3: 目視確認**（`npm run dev`）：「サイゼリア」と打つと候補1位がサイゼリヤ／キーボードとタップで選べる／候補を選んだ直後に古い結果が上書きしない（続けて2つ検索して最後の結果だけ出る）／存在しない名前で0件→「もしかして」ボタン／「！」は送信されない／幅375pxで横スクロールが出ない
- [ ] **Step 4: Commit** — `feat: 検索欄・候補・ランキング`

---

### Task 8: 地図と3つの表示

**Files:**
- Create: `components/MapView.tsx`, `components/layers/HeatLayer.tsx`, `components/layers/ChoroplethLayer.tsx`, `components/layers/PinLayer.tsx`
- Modify: `app/page.tsx`（仮の枠を `MapView` に）

**Interfaces:**
- Consumes: `SearchResult`、`data/prefectures.json`
- Produces:
  - `type ViewMode = "heat" | "choropleth" | "pins"`（初期値 `"heat"`）
  - `<MapView result={SearchResult | undefined} />` — page から `next/dynamic` の `ssr: false` で読み込む。中心 `[37.5, 137.5]`、ズーム5（幅640px未満は4）。右上に「ヒートマップ / 都道府県 / ピン」の切り替え。表示中の1つだけ描く。新しい結果が来たら全店が入る範囲へ `fitBounds`（0件なら日本全体のまま）
  - 各レイヤー：`({ map, result }: { map: L.Map; result: SearchResult }) => null`、アンマウント時に自分のレイヤーを外す
    - Heat：`leaflet.heat`、点は `[lat, lon, 1]`
    - Choropleth：`prefectures.json` を選んだときだけ動的 import。0件は塗らない、それ以外は件数で5段階。県タップで「○○県 N店」
    - Pins：`leaflet.markercluster`、ポップアップは店名と住所（あれば）。`L.Icon.Default` の画像パスを明示設定
  - 右下に出典（OSM、境界データ、NSI）

- [ ] **Step 1:** `npm i leaflet leaflet.heat leaflet.markercluster` と `@types/leaflet` `@types/leaflet.markercluster`（`leaflet.heat` に型がなければ `types/leaflet-heat.d.ts` に最小の宣言）
- [ ] **Step 2:** 実装
- [ ] **Step 3:** `npm run build` → 成功（`window is not defined` が出ない）
- [ ] **Step 4: 目視確認**：「スシロー」「サイゼリヤ」「すき家」で3表示の切り替えが再検索なしで動く、ピン・県のタップ、幅375pxとPC幅
- [ ] **Step 5: Commit** — `feat: 地図と3つの表示`

---

### Task 9: 事前保存スクリプトと公開

**Files:**
- Create: `scripts/prewarm.ts`, `README.md`
- Modify: `package.json`（`"prewarm": "tsx --env-file=.env.local scripts/prewarm.ts"`）

**Interfaces:**
- Consumes: `handleSearch` を使わず、`createSupabaseStore`、`fetchShops`、`assignPrefectures`、`countByPrefecture`、`data/brands.json` を直接使う

- [ ] **Step 1:** `prewarm.ts` を実装：`brands.json` の `count` 上位100件を順に、30日以内の保存があれば飛ばし、なければ調べて保存（0件は保存しない）。1件ごとに5秒空け、Busy は30秒待って1回だけやり直す。最後に「保存 N件 / 飛ばし N件 / 失敗 N件」を表示
- [ ] **Step 2:** `README.md`：起動方法、環境変数、`supabase/schema.sql` の実行方法、`npm run build-brands` と `npm run prewarm` の使いどころ、出典とライセンス、Vercel の Root Directory を `map-app` にすること
- [ ] **Step 3: 利用者の作業をお願いする**：Supabase のプロジェクト作成、SQL Editor で `schema.sql` を実行、`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を `.env.local` と Vercel の環境変数に設定、Vercel へのデプロイ方法（GitHub 連携か `npx vercel`）の確認
- [ ] **Step 4:** `npm run prewarm` を実行 → Supabase の `search_results` に件数が入ったことを確認
- [ ] **Step 5: 公開後の確認**：保存済みのチェーン（「スシロー」）がすぐ出る／同じ検索の2回目で `x-vercel-cache: HIT`／保存のない店名で調べた後、Supabase に1行増える／スマホ実機かブラウザのスマホ表示で spec の目視確認項目を通しで
- [ ] **Step 6: Commit** — `feat: 事前保存スクリプトとREADME`
