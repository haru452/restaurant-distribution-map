# レストラン分布マップ 設計書

日付: 2026-11-10（同日改訂：検索の主なデータ元を Supabase に変更）

## 目的

レストランの名前（例：「スシロー」「サイゼリヤ」）で検索すると、その店が日本のどの辺りに多いかを地図で見られるWebアプリ。

### 利用者から聞いた要件
- 店名で検索し、店の分布を地図で見られる
- スマホでもPCでも見られる
- Vercelで公開する
- 見せ方は「ヒートマップ」「都道府県の色分け」「ピン」の3つを用意し、利用者が切り替えられる
- データはOpenStreetMapだけを使う（Google Places APIは使わない）
- 誤字をしても、予想できる範囲で目的の店にたどり着ける（入力中の候補＋0件時の「もしかして」）
- マイナーチェーンも候補に出る
- 有名チェーンはSupabaseに保存して、すぐいつでも呼び出せる
- Supabaseにない店のときは、OpenStreetMapのAPIに直接問い合わせる

### 前提（仮定）
- 対象は日本国内のみ
- 費用はかけない（Vercel Hobby、Supabase Free）
- git リポジトリは `map-app/` 単独（`es` リポジトリとは別）

### 完成の条件
- 店名を入力すると、全国の店舗数・都道府県ランキング・地図が表示される
- Supabase に入っている店は1秒程度で結果が出る
- 3つの表示を、再検索なしで切り替えられる
- 幅375pxのスマホ画面と、PC画面の両方で崩れずに使える
- Vercelに公開して動く
- 「サイゼリア」「マクドナルト」「すしろ」と入力すると、正しい店名が候補の1位に出る

## 対象外（今回は作らない）
- Google Places APIなど、OpenStreetMap以外のデータ元
- ユーザー登録、お気に入り、検索履歴の保存
- 海外の店

## 変更の経緯

当初は検索のたびに Overpass API（OpenStreetMap の公開サーバー）へ全国検索する設計だった。実測（2026-11-10）で全国検索が70秒以上、東京都心だけでも58秒かかり、「満杯」の応答も返った。Vercel の関数は60秒で打ち切られるため、日本の飲食店データを前もって Supabase に取り込み、検索は Supabase で行う形に変えた。Supabase で見つからないときだけ Overpass に問い合わせる。

## 構成

- フレームワーク：Next.js（App Router、TypeScript）
- 公開先：Vercel
- データベース：Supabase（Postgres、`pg_trgm` で部分一致を速くする）
- 地図：Leaflet
  - ヒートマップ：`leaflet.heat`
  - ピンのまとめ表示：`leaflet.markercluster`
  - 都道府県の色分け：都道府県境界のGeoJSONで塗り分け
- 地図の背景画像：OpenStreetMapの標準タイル。出典を表示する
- 都道府県境界データ：地球地図日本（dataofjapan/land 経由）を簡略化した `data/prefectures.json`。出典を明記する（`data/LICENSE-prefectures.md`）
- 都道府県の判定：`@turf/boolean-point-in-polygon`

### ファイル構成（各ファイル600行以内）

```
map-app/
  app/
    page.tsx                 画面全体の配置
    api/search/route.ts      検索API（入口のみ。処理は lib に任せる）
    api/keepalive/route.ts   Supabase の一時停止を防ぐための毎日の呼び出し先
  components/
    SearchBar.tsx            検索欄と入力中の候補
    useSearch.ts             検索の状態管理
    MapView.tsx              地図と表示切り替え（Leafletはブラウザ専用なので動的読み込み）
    layers/HeatLayer.tsx     ヒートマップ表示
    layers/ChoroplethLayer.tsx 都道府県の色分け表示
    layers/PinLayer.tsx      ピン表示（まとめ表示つき）
    RankingPanel.tsx         全国の店舗数と都道府県ランキング、「もしかして」
  lib/
    normalize.ts             検索語の表記ゆれをそろえる
    suggest.ts               似ている店名を探す（ブラウザで動く）
    brandName.ts             店名から支店名を取る、チェーン名を数える
    overpass.ts              OpenStreetMap（Overpass API）への問い合わせ
    shopStore.ts             Supabase の店テーブルの検索と書き込み
    search.ts                検索の流れ（Supabase → なければ Overpass）
    prefecture.ts            位置から都道府県を判定して数える
    types.ts                 共通の型
  data/
    prefectures.json         都道府県境界（GeoJSON形式）
    brands.json              候補用のチェーン店名一覧（import で生成してコミット）
  scripts/
    import-shops.ts          日本の飲食店を Supabase に取り込み、brands.json を作る（手で実行）
  supabase/
    schema.sql               表と索引の作成SQL
  vercel.json                毎日の keepalive の設定
```

## 画面

- 上：検索欄と検索ボタン。入力中は似ている店名を最大5件、欄の下に出す（PCは矢印キーとEnter、スマホはタップで選ぶ）
- 中央：日本地図。右上に表示の切り替えボタン「ヒートマップ / 都道府県 / ピン」（初期表示はヒートマップ）
- PCでは地図の右、スマホでは地図の下：全国の店舗数と都道府県ランキング（多い順、件数の横棒つき）
- ピン表示で店をタップすると、店名と住所（データにある場合）を表示
- 状態ごとの表示：検索前（使い方の案内）、検索中、結果あり、0件、エラー
- 0件のときは「もしかして：」と候補を最大3件ボタンで出す（押すとその名前で再検索）。入力を勝手に書き換えない

## データ（Supabase）

### 表 `supabase/schema.sql`

```sql
create extension if not exists pg_trgm;

create table if not exists shops (
  osm_id      text primary key,              -- 例 "node/123"、"way/456"
  name        text not null,
  brand       text,
  lat         double precision not null,
  lon         double precision not null,
  address     text,
  prefecture  text not null,
  search_key  text not null,                 -- name / name:ja / brand / brand:ja の looseKey を "|" でつないだもの
  updated_at  timestamptz not null default now()
);
create index if not exists shops_search_key_trgm on shops using gin (search_key gin_trgm_ops);
alter table shops enable row level security;  -- ポリシーは作らない＝service role 以外は読み書き不可
```

### 環境変数（Vercel とローカルの `.env.local`。`.env.example` に名前だけ書く）
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバー側だけで使う。`NEXT_PUBLIC_` を付けない）

### 取り込み `scripts/import-shops.ts`（手で実行。月1回くらい）
1. 都道府県ごとに47回、Overpass に `area["name"="<都道府県名>"]["admin_level"="4"]` 内の対象 `amenity` で、`name` / `name:ja` / `brand` / `brand:ja` のどれかがある飲食店を `out center tags` で問い合わせる。1回ごとに10秒空ける。時間切れ・混雑は60秒待って最大5回やり直す。Overpass の `[timeout:300]`
2. 店ごとに `osm_id`、名前、ブランド、位置、住所、都道府県（問い合わせた県）、`search_key` を作り、1,000件ずつ upsert する
3. 47都道府県すべて成功したときだけ、今回の取り込みより古い `updated_at` の行（閉店などで消えた店）を消す
4. 集めた店名から `data/brands.json` を作る（下の「候補の一覧」）
5. 進み具合を都道府県ごとに表示する。途中で止まっても、やり直せば upsert なので壊れない

### 一時停止を防ぐ
- Supabase Free は1週間使われないと一時停止する。`vercel.json` の cron で毎日1回 `/api/keepalive` を呼び、`shops` を1件読む
- それでも止まった場合は、検索は Overpass への直接問い合わせで続ける（遅い）。再開は Supabase の管理画面から

## 検索の流れ

1. 画面が `GET /api/search?q=<店名>` を呼ぶ。画面側でも `normalizeQuery` を通してから `q` を作る（CDN キャッシュの表記ゆれを防ぐ）
2. API が検索語をそろえる（`normalizeQuery`）。空・記号だけなら 400
3. **Supabase で探す**：`search_key` に `looseKey(検索語)` を含む行（`like '%…%'`。`%` `_` `\` はエスケープ）。最大5,001件まで、1,000件ずつ取る（Supabase API の1回の上限が1,000件のため）。5秒で打ち切り
4. 1件以上あればそれを返す
5. 0件、または Supabase が使えない（環境変数なし・一時停止・失敗・時間切れ）なら **Overpass に直接問い合わせる**（`lib/overpass.ts`）
   - 範囲：日本（`area["ISO3166-1"="JP"]`）
   - 条件：`name` / `name:ja` / `brand` / `brand:ja` のどれかに検索語が含まれる（大文字小文字は区別しない。正規表現の特殊文字は無害化する）。かなは1文字ごとにひらがな・カタカナの両方に一致させる（例：「スキ家」→ `[すス][きキ]家`）
   - 小さい字と大きい字は同じ字として一致させる（例：ヤ → `[やゃヤャ]`）。「ー」はあってもなくても一致させる（`ー?`）
   - 種類：`amenity` が `restaurant` / `fast_food` / `cafe` / `food_court` / `pub` / `bar`
   - node と way の両方を対象にし、way は中心点を使う（`out center`）
   - 問い合わせの時間切れは50秒。Overpassが200を返しても `remark` に時間切れ・実行エラーが書かれていれば混雑扱い（503）にする
   - 見つかった店は、裏で（`@vercel/functions` の `waitUntil`）Supabase に upsert する。次からは Supabase で見つかる
6. 都道府県ごとに数える（`lib/prefecture.ts`）。Supabase の行は保存済みの `prefecture` を使う。Overpass の結果は位置から判定し、どの県にも入らない点は「不明」
7. 返すデータ：

```ts
type SearchResult = {
  query: string;            // そろえた後の検索語
  total: number;            // 返した店の数
  truncated: boolean;       // 上限で打ち切ったか
  source: "db" | "live";    // Supabase から / Overpass から
  shops: { name: string; lat: number; lon: number; address?: string; prefecture: string }[];
  byPrefecture: { prefecture: string; count: number }[]; // 多い順
};
```

8. 3つの表示はすべてこのデータから作る。切り替えで再検索しない

### キャッシュ
- 成功した結果に `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400` を付け、VercelのCDNに1日保存させる。エラーは `no-store`
- APIの最大実行時間は60秒（`export const maxDuration = 60`）

## エラー時の動き

| 状況 | APIの返し方 | 画面の表示 |
|---|---|---|
| 空欄・記号だけ | 400 | 送信前に画面で止め、「店名を入力してください」 |
| Supabase も Overpass も0件 | 200（`total: 0`） | 「見つかりませんでした。カタカナや英語の表記も試してください」と「もしかして」 |
| Supabase で0件かつ Overpass が混雑（429/504）・時間切れ | 503 | 「混み合っています。少し待ってもう一度お試しください」と再試行ボタン |
| 5,000件を超える | 200（先頭5,000件、`truncated: true`） | 「件数が多いため一部のみ表示しています」 |
| その他の失敗 | 500 | 「エラーが発生しました」と再試行ボタン |

## 誤字への対応（候補）

### 候補の一覧 `data/brands.json`
- 形：`{ "name": string, "aliases": string[], "count": number }[]`（`count` の多い順。`count` は全国の店舗数、NSIだけにある名前は0）
- 作り方（`import-shops.ts` の最後に作る。結果をコミットする。公開中のアプリは外部に取りに行かない）
  1. Name Suggestion Index（BSD-3-Clause）の `amenity/restaurant|fast_food|cafe|food_court|pub|bar` から、`locationSet` に `jp` を含む項目の `name` / `name:ja` / `brand` / `brand:ja` / `name:en` を取る
  2. 取り込んだ店ごとに、`brand` があればそれを店名とする。なければ `name` から支店名を取る：空白・「・」で区切られた末尾が `店$` なら、その部分を取る（「スシロー 渋谷店」→スシロー）。区切りがなく `店$` で終わる名前は、ほかの店名が先頭に一致すればその名前にまとめ（「スシロー渋谷店」→スシロー）、一致しなければそのまま残す
  3. 全国で3店舗以上ある店名だけ残し、1と `looseKey` が同じものをまとめる（NSI の名前を優先、`count` は OSM の数）
- ライセンス：NSI は BSD-3-Clause、OSM 由来のデータは ODbL。README と画面の出典表記に書く

### 似ている名前を探す `lib/suggest.ts`
- 入力と一覧の両方を `looseKey`（「ー」を除き、小さい字を大きい字に、英字を小文字に）にしてから比べる
- 並べ方：①先頭一致 ②途中に含まれる ③編集距離が許容範囲内（そろえた入力の長さが4文字以下なら1、それ以上なら2）。同じ順位の中では編集距離が小さい順、次に店舗数の多い順、次に短い名前順
- 結果は最大5件（「もしかして」は先頭3件）。入力が1文字以下なら出さない
- ブラウザで動かす。1文字ごとにサーバーへ問い合わせない（入力から150ms待ってから計算）

### 限界
- 候補はOpenStreetMapに3店舗以上登録されている名前とNSIの名前だけ。それ以外の店の誤字は直せない
- OpenStreetMapに登録がない店は検索に出ない。マイナーチェーンほど実際より少なく出ることがある
- Supabase のデータは取り込んだ時点のもの。新しい店は、次の取り込みか、誰かが検索して Overpass から取れたときに入る

## テスト

自動テスト（Vitest）は、間違うと結果が誤る部分に絞る。
- `normalize.ts`：全角/半角、ひらがな/カタカナ、空白、記号だけの入力、`looseKey`
- `prefecture.ts`：代表的な地点（東京駅、大阪駅、札幌駅、那覇空港、海上）の県判定と集計
- `overpass.ts`：問い合わせ文の組み立て（特殊文字の無害化を含む）、返答の整形（`osm_id`・`search_key` を含む）、混雑の判定
- `suggest.ts`：「サイゼリア」→サイゼリヤ、「マクドナルト」→マクドナルド、「すしろ」→スシローが1位。無関係な語（例「あいうえおかき」）では候補なし
- `brandName.ts`：「スシロー 渋谷店」「スシロー渋谷店」「スシロー・本店」→スシロー、3店舗未満は残さない
- `search.ts`：Supabase で見つかる／Supabase 0件→Overpass で見つかり裏で保存／両方0件／Supabase 失敗→Overpass／Overpass 混雑→503
- `shopStore.ts`：`like` 用のエスケープ、1,000件ずつの取得で5,001件で止まること

目視確認：
- 「スシロー」「サイゼリヤ」「すき家」で検索し、3つの表示の切り替え、ピンのタップ、ランキングを確認
- 幅375pxのスマホ表示とPC表示
- 0件の検索、空欄の検索
- Supabase に入っている店がすぐ出ること、入っていない店で Overpass に問い合わせた後に Supabase に行が増えること
- 環境変数を外しても検索ができること（Overpass だけで動く。遅い）
