# レストラン分布マップ 設計書

日付: 2026-11-10

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

### 前提（仮定）
- 対象は日本国内のみ
- 費用はかけない（無料のサービスだけを使う）（Vercel Hobby、Supabase Free）

### 完成の条件
- 店名を入力すると、全国の店舗数・都道府県ランキング・地図が表示される
- 3つの表示を、再検索なしで切り替えられる
- 幅375pxのスマホ画面と、PC画面の両方で崩れずに使える
- Vercelに公開して動く
- 「サイゼリア」「マクドナルト」「すしろ」と入力すると、正しい店名が候補の1位に出る

## 対象外（今回は作らない）
- Google Places APIなど、OpenStreetMap以外のデータ元
- ユーザー登録、お気に入り、検索履歴の保存
- 海外の店

## 構成

- フレームワーク：Next.js（App Router、TypeScript）
- 公開先：Vercel
- 地図：Leaflet
  - ヒートマップ：`leaflet.heat`
  - ピンのまとめ表示：`leaflet.markercluster`
  - 都道府県の色分け：都道府県境界のGeoJSONで塗り分け
- 地図の背景画像：OpenStreetMapの標準タイル。出典を表示する
- 都道府県境界データ：オープンライセンスで公開されている簡略化済みのGeoJSON。`data/prefectures.json` に置き、サーバーは import で読む。画面側は「都道府県」表示を選んだときだけ動的 import で読む。ライセンス表記を守る
- 都道府県の判定：`@turf/boolean-point-in-polygon`

### ファイル構成（各ファイル600行以内）

```
map-app/
  app/
    page.tsx                 画面全体の配置
    api/search/route.ts      検索API（入口のみ。処理は lib に任せる）
  components/
    SearchBar.tsx            検索欄と入力中の候補
    MapView.tsx              地図と表示切り替え（Leafletはブラウザ専用なので動的読み込み）
    layers/HeatLayer.tsx     ヒートマップ表示
    layers/ChoroplethLayer.tsx 都道府県の色分け表示
    layers/PinLayer.tsx      ピン表示（まとめ表示つき）
    RankingPanel.tsx         全国の店舗数と都道府県ランキング
  lib/
    normalize.ts             検索語の表記ゆれをそろえる
    suggest.ts               似ている店名を探す（ブラウザで動く）
    overpass.ts              OpenStreetMap（Overpass API）への問い合わせ
    store.ts                 Supabaseへの結果の保存と読み出し
    prefecture.ts            位置から都道府県を判定して数える
    types.ts                 共通の型
  data/
    prefectures.json         都道府県境界（GeoJSON形式）
    brands.json              候補用のチェーン店名一覧（scripts で生成してコミット）
  scripts/
    build-brands.ts          brands.json を作る（手で実行）
    prewarm.ts               有名チェーンの結果を前もってSupabaseに入れる（手で実行）
  supabase/
    schema.sql               表の作成SQL
```

データ元への問い合わせは `lib/overpass.ts` に閉じ込める。API側は「店の一覧を返す関数」として呼ぶだけにし、将来データ元を差し替えるときはこのファイルだけ替えればよい形にする。

## 画面

- 上：検索欄と検索ボタン。入力中は似ている店名を最大5件、欄の下に出す（PCは矢印キーとEnter、スマホはタップで選ぶ）
- 中央：日本地図。右上に表示の切り替えボタン「ヒートマップ / 都道府県 / ピン」（初期表示はヒートマップ）
- PCでは地図の右、スマホでは地図の下：全国の店舗数と都道府県ランキング（多い順、件数の横棒つき）
- ピン表示で店をタップすると、店名と住所（データにある場合）を表示
- 状態ごとの表示：検索前（使い方の案内）、検索中、結果あり、0件、エラー
- 0件のときは「もしかして：」と候補を最大3件ボタンで出す（押すとその名前で再検索）。入力を勝手に書き換えない

## 検索の流れ

1. 画面が `GET /api/search?q=<店名>` を呼ぶ
2. API が検索語の表記をそろえる（`lib/normalize.ts`）
   - 前後の空白を除く、全角英数字を半角にする、ひらがなをカタカナにする
   - そろえた結果が空、または記号だけなら 400 を返す
3. Overpass API に問い合わせる（`lib/overpass.ts`）
   - 範囲：日本（`area["ISO3166-1"="JP"]`）
   - 条件：`name` / `name:ja` / `brand` / `brand:ja` のどれかに検索語が含まれる（大文字小文字は区別しない。正規表現の特殊文字は無害化する）。かなは1文字ごとにひらがな・カタカナの両方に一致させる（例：「スキ家」→ `[すス][きキ]家`）。店名がひらがなの店（すき家など）も見つけるため
   - 種類：`amenity` が `restaurant` / `fast_food` / `cafe` / `food_court` / `pub` / `bar`
   - node と way の両方を対象にし、way は中心点を使う（`out center`）
   - 小さい字と大きい字は同じ字として一致させる（例：ヤ → `[やゃヤャ]`）。「ー」はあってもなくても一致させる（`ー?`）
   - 問い合わせの時間切れは50秒。Overpassが200を返しても `remark` に時間切れ・実行エラーが書かれていれば混雑扱い（503）にする
4. 結果を整形する：名前、緯度経度、住所（`addr:*` タグがあれば組み立てる）
5. 都道府県ごとに数える（`lib/prefecture.ts`）。どの県にも入らない点（海上など）は「不明」とする
6. 返すデータ：

```ts
type SearchResult = {
  query: string;            // そろえた後の検索語
  total: number;            // 返した店の数
  truncated: boolean;       // 上限で打ち切ったか
  shops: { name: string; lat: number; lon: number; address?: string; prefecture: string }[];
  byPrefecture: { prefecture: string; count: number }[]; // 多い順
};
```

7. 3つの表示はすべてこのデータから作る。切り替えで再検索しない

### 保存（キャッシュ）
- 成功した結果に `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400` を付け、VercelのCDNに1日保存させる
- 表記ゆれで別扱いにならないよう、画面側でも同じ `normalize` を通してから `q` を作る
- APIの最大実行時間は60秒（`export const maxDuration = 60`）

## エラー時の動き

| 状況 | APIの返し方 | 画面の表示 |
|---|---|---|
| 空欄・記号だけ | 400 | 送信前に画面で止め、「店名を入力してください」 |
| 0件 | 200（`total: 0`） | 「見つかりませんでした。カタカナや英語の表記も試してください」 |
| Overpassが混雑（429/504）・時間切れ | 503 | 「混み合っています。少し待ってもう一度お試しください」と再試行ボタン |
| 5,000件を超える | 200（先頭5,000件、`truncated: true`） | 「件数が多いため一部のみ表示しています」 |
| その他の失敗 | 500 | 「エラーが発生しました」と再試行ボタン |

エラー結果はキャッシュしない。

## テスト

自動テスト（Vitest）は、間違うと結果が誤る部分に絞る。
- `normalize.ts`：全角/半角、ひらがな/カタカナ、空白、記号だけの入力
- `suggest.ts`：「サイゼリア」→サイゼリヤ、「マクドナルト」→マクドナルド、「すしろ」→スシローが1位。無関係な語（例「あいうえおかき」）では候補なし
- `build-brands.ts` の店名の取り出し：「スシロー 渋谷店」「スシロー渋谷店」「スシロー・本店」→スシロー
- `prefecture.ts`：代表的な地点（東京駅、大阪駅、札幌駅、那覇空港、海上）の県判定と集計
- `overpass.ts`：問い合わせ文の組み立て（特殊文字の無害化を含む）と、Overpassの返答の整形
- `search.ts`：保存あり（新しい／古い）・保存なし・Supabase失敗・0件は保存しない、の各場合の動き

目視確認：
- 「スシロー」「サイゼリヤ」で検索し、3つの表示の切り替え、ピンのタップ、ランキングを確認
- 幅375pxのスマホ表示とPC表示
- 0件の検索、空欄の検索
- Vercelのプレビュー環境で、2回目の同じ検索が速くなること
- Supabaseに結果が保存され、Vercelの保存が切れた後も同じ検索がすぐ返ること
- 環境変数を外しても検索ができること（Overpassだけで動く）

## 誤字への対応（候補）

### 候補の一覧 `data/brands.json`
- 形：`{ "name": string, "aliases": string[], "count": number }[]`（`name` は表示・検索に使う正式名。`count` は2で数えた全国の店舗数、NSIだけにある名前は0）
- 作り方（`scripts/build-brands.ts`、手で実行し、結果をコミットする。公開中のアプリは外部に取りに行かない）
  1. Name Suggestion Index（BSD-3-Clause）の `amenity/restaurant|fast_food|cafe|food_court|pub|bar` から、`locationSet` に `jp` を含む項目の `name` / `name:ja` / `brand` / `brand:ja` / `name:en` を取る
  2. Overpass API で、都道府県ごとに47回（1回ずつ数秒空ける）、対象 `amenity` の飲食店の `name` と `brand` を `out tags` で集める
  3. `brand` があればそれを店名とする。なければ `name` から支店名を取る：空白・「・」で区切られた末尾が `店$` なら、その部分を取る（「スシロー 渋谷店」→スシロー）。区切りがなく `店$` で終わる名前は、ほかの店名（1や区切りで取れた名前）が先頭に一致すればその名前にまとめ（「スシロー渋谷店」→スシロー）、一致しなければそのまま残す
  4. 全国で3店舗以上ある店名だけ残し、1と合わせて重複を除く
- ライセンス：NSI は BSD-3-Clause、OSM 由来の名前は ODbL。README と画面の出典表記に書く

### 似ている名前を探す `lib/suggest.ts`
- 入力と一覧の両方を、`normalizeQuery` のあとさらに「ー」を除き、小さい字を大きい字にしてから比べる
- 並べ方：①先頭一致 ②途中に含まれる ③編集距離が許容範囲内（そろえた入力の長さが4文字以下なら1、それ以上なら2）。同じ順位の中では編集距離が小さい順、次に短い名前順
- 結果は最大5件（「もしかして」は先頭3件）。入力が1文字以下なら出さない
- ブラウザで動かす。1文字ごとにサーバーへ問い合わせない（入力から150ms待ってから計算）

### 限界
- 候補はOpenStreetMapに3店舗以上登録されている名前とNSIの名前だけ。それ以外の店の誤字は直せない
- OpenStreetMapに登録がない店は検索に出ない。マイナーチェーンほど実際より少なく出ることがある

## 結果の保存（Supabase）

一度調べた結果をSupabaseに保存し、次からはすぐ返す。Vercel CDN の1日キャッシュはそのまま残す（Supabaseの前段）。

### 表 `supabase/schema.sql`

```sql
create table if not exists search_results (
  query      text primary key,          -- normalizeQuery 後の検索語
  result     jsonb not null,            -- SearchResult
  updated_at timestamptz not null default now()
);
alter table search_results enable row level security; -- ポリシーは作らない＝service role 以外は読み書き不可
```

### 環境変数（Vercel とローカルの `.env.local`。`.env.example` に名前だけ書く）
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバー側だけで使う。`NEXT_PUBLIC_` を付けない）

### 検索の流れ（「検索の流れ」の3〜6を次で包む）
1. Supabase から `query` で1件読む（3秒で打ち切り）
2. あって、`updated_at` が30日以内 → その結果を返す
3. あって、30日より古い → 古い結果をすぐ返し、裏で（`@vercel/functions` の `waitUntil`）Overpass で調べ直して上書き保存
4. ない → Overpass で調べて返す。`total > 0` なら裏で保存（0件は誤字の可能性が高いので保存しない）
5. 環境変数がない・Supabase が一時停止・読み書きの失敗は「保存なし」として扱い、Overpass で続ける（ログだけ残す）。アプリは止めない

### 有名チェーンの事前保存 `scripts/prewarm.ts`
- `brands.json` を `count` の多い順に上位100件、5秒ずつ空けて調べて保存する。既に30日以内の結果があるものは飛ばす
- 手で実行する（`npm run prewarm`）。`.env.local` の環境変数を使う

### 注意
- Supabase Free は1週間使われないと一時停止する。停止中は5の動きで遅くなるだけ。再開は管理画面から
- Vercel Hobby は使われなくても止まらない。月ごとの無料枠を超えると止められることがある。非営利利用に限る
