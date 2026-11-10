# レストラン分布マップ

店名（例：「スシロー」「サイゼリヤ」）で検索すると、その店が日本のどこに多いかを地図とランキングで見られるWebアプリです。スマホとPCの両方で使えます。

公開中：https://restaurant-distribution-map.vercel.app/

## 使い方

### 店を検索する
1. 上の検索欄に店名を入れて「検索」を押す（ひらがな・カタカナ・英語どれでも大丈夫です）
2. 入力中は、似ているチェーン店名が候補に出ます。少し間違えても（例：「サイゼリア」→サイゼリヤ）候補から選べます
   - PC：↑↓キーで選んで Enter
   - スマホ：候補をタップ
3. 地図と、右（スマホは下）のランキングに結果が出ます
4. 見つからなかったときは「もしかして：」に近い店名が出るので、押すとその名前で検索し直します

### 会社名でまとめて検索する
- 「すかいらーく」「ゼンショー」のように会社名で検索すると、その会社のチェーン（例：ガスト・バーミヤン・夢庵…）をまとめて表示します
- ランキングにチェーンごとの店数が出ます。チェーン名を押すと、そのチェーンだけの表示に切り替わります
- 「ガスト」のようにチェーン名で検索したときは、そのチェーンだけです
- 会社の一覧（`data/companies.json`）は全国の取り込みのときに作ります（下の「データの取り込み」）

### 地図の見方を切り替える
地図の右上のボタンで切り替えます（最初は「都道府県」）。
- **都道府県**：店の多い県ほど濃い色。県をタップすると店数が出ます
- **ヒートマップ**：店が集まっている場所ほど赤く光ります
- **ピン**：店ごとのピン。近い店は数字の丸にまとまり、拡大すると分かれます。ピンをタップすると店名と住所が出ます

### 現在地へ移動する
地図の右下の丸いボタンを押すと、現在地まで地図が移動します（最初に位置情報の許可を聞かれます）。位置情報はブラウザの中だけで使い、サーバーには送りません。

### 店がない県を見る
ランキングの「店がない県を見る（○県）」を押すと、その店が1軒もない県の一覧に切り替わり、地図ではその県がグレーの斜線になります。「ランキングに戻る」で元に戻ります。
※ OpenStreetMap に登録がないだけで、実際にはある場合もあります。

### AIに分布の理由を考えてもらう
ランキングの「🤖 なぜこの分布？（AIの考察）」を押すと、Gemini が10〜30秒で考察を出します。
- 何屋さんか、有名なもの（名物メニューなど）
- 本社・創業の地（地図に青い点線の枠で表示）
- 分布の理由（創業地からの広がり方、人口の割に多い・少ない県など）

決まりごと：
- 1日100回まで（日本時間で日付が変わると戻ります）
- 一度考察した店は30日間保存し、同じ店をもう一度見ても回数は減りません
- AIの知識による考察なので、正確でない場合があります

## しくみ

- 店のデータは OpenStreetMap から前もって取り込み、Supabase の `shops` 表に入れておきます。検索は Supabase で行うので速く返ります
- Supabase に見つからない店は、OpenStreetMap（Overpass API）に直接問い合わせます。見つかった店は Supabase にも追加されます
- 候補は `data/brands.json`（チェーン名）と `data/companies.json`（会社 → チェーン）から、ブラウザの中で探します
- AIの考察は Gemini API（`gemini-3.5-flash`）を使い、結果を Supabase の `insights` 表に保存します

## はじめての準備

1. 依存パッケージを入れる：`npm install`
2. Supabase でプロジェクトを作る（無料プラン）
3. Supabase の **SQL Editor** で、次の2つを順に貼り付けて実行する
   - `supabase/schema.sql`（店の表）
   - `supabase/insight.sql`（AIの考察の保存と、1日の利用回数）
4. `.env.example` をコピーして `.env.local` を作り、値を入れる
   - `SUPABASE_URL`：Supabase の Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`：Supabase の Secret key（`sb_secret_...`）
   - `GEMINI_API_KEY`：Google AI Studio（https://aistudio.google.com/apikey ）で作ったキー
   - どれも秘密の値です。画面側のコードやGitHubに出さないでください
5. 店のデータを取り込む（下の「データの取り込み」）
6. 起動：`npm run dev` → http://localhost:3000

## データの取り込み

```bash
npm run import-shops -- --only=東京都   # 1県だけ試す（数分）
npm run import-shops                    # 全国（40分〜1時間）。brands.json と companies.json も作り直す
npm run import-shops -- --brands-only   # 取り込みはせず、Supabase の店から brands.json だけ作り直す（2分ほど）
```

- OpenStreetMap の公開サーバーに負担をかけないよう、都道府県ごとに間を空けて問い合わせます。混んでいるときは自動で待ってやり直します
- 失敗した県があっても、候補と会社の一覧は作ります。最後に失敗した県名が出るので、`--only=県名` で取り込み直してください
- 全国の取り込みが全部成功したときだけ、今回見つからなかった古い店（閉店など）を消します
- 月1回くらい実行すると、データが新しく保たれます（手順は上の「月1回くらいやること」）
- 会社の一覧は、店に付いているブランドID（Wikidata）から親会社をたどって作ります

## 月1回くらいやること

店のデータは自動では新しくならないので、月に1回くらい次をやってください（全部で1時間ほど。ほとんどは待ち時間です）。

1. **店のデータを新しくする**
   ```bash
   npm run import-shops
   ```
   - 新しくできた店が増え、閉店した店が消えます。候補（`data/brands.json`）と会社の一覧（`data/companies.json`）も作り直されます
   - 最後に「失敗した都道府県」が出たら、その県だけ `npm run import-shops -- --only=県名` で取り込み直す
   - OpenStreetMap のサーバーが混んでいて失敗が多いときは、時間をおいてやり直す
2. **作り直した一覧を公開サイトに反映する**
   ```bash
   git add data/brands.json data/companies.json
   git commit -m "data: 店のデータを更新"
   git push
   ```
   GitHub に上げると、数分で Vercel の公開サイトに反映されます
3. **公開サイトで動くか確かめる**
   - 「スシロー」などで検索して地図とランキングが出るか
   - 「すかいらーく」など会社名でまとめて出るか
   - 「なぜこの分布？」でAIの考察が出るか（出ないときは下の「4」を確認）
4. **無料枠と設定を確かめる**
   - **Supabase**（Settings → Usage）：データベースの容量が 500MB を超えそうでないか
   - **Vercel**（Usage）：無料枠の上限に近づいていないか
   - **Gemini**：AIの考察が「AIが混み合っているか、使えない状態です」ばかりになるときは、使っているモデルが終了した可能性があります。Google AI Studio で今使えるモデル名を調べ、Vercel の環境変数 `GEMINI_MODEL` に入れて Redeploy してください
5. **（あれば）部品の更新**：`npm audit` で、使っている部品に危ない点が見つかっていないか確かめる

## 公開（Vercel）

1. このリポジトリを GitHub に上げ、Vercel で Import する（Root Directory はリポジトリのいちばん上のまま）
2. Vercel の **Settings → Environment Variables** に入れる
   - Supabase の値：Vercel の「Supabase とつなぐ」を使えば自動で入ります。使わない場合は `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を入れる
   - `GEMINI_API_KEY`
3. 環境変数を足したり変えたりしたら、**Deployments** から Redeploy する（デプロイし直したときに反映されます）
4. `vercel.json` の Cron が毎日1回 `/api/keepalive` を呼び、Supabase 無料プランの一時停止（1週間使われないと止まる）を防ぎます

### 省略できる環境変数
- `GEMINI_MODEL`：使う Gemini のモデル（既定 `gemini-3.5-flash`）
- `GEMINI_SEARCH`：`1` にすると Google 検索で調べてから考察します（無料枠では使えませんでした）

## 開発

- テスト：`npm test`
- 型チェック：`npx tsc --noEmit`
- 設計書：`docs/superpowers/specs/2026-11-10-restaurant-distribution-map-design.md`

## 出典とライセンス

- 地図・店舗データ：© OpenStreetMap contributors（ODbL 1.0） https://www.openstreetmap.org/copyright
- 都道府県境界：地球地図日本（国土地理院）、dataofjapan/land 経由。詳細は `data/LICENSE-prefectures.md`
- 都道府県の人口：令和2年国勢調査（`data/population.json`）
- 候補のチェーン店名：Name Suggestion Index（BSD-3-Clause）と OpenStreetMap。詳細は `data/LICENSE-brands.md`
- 会社とチェーンの関係：Wikidata（CC0）
- 営利目的で使う場合は、地球地図日本の著作権者への利用報告が必要です
