# レストラン分布マップ

店名（例：「スシロー」「サイゼリヤ」）で検索すると、その店が日本のどこに多いかを「ヒートマップ / 都道府県の色分け / ピン」で見られるWebアプリです。スマホとPCの両方で使えます。

## しくみ

- 店のデータは OpenStreetMap から前もって取り込み、Supabase の `shops` 表に入れておきます。検索は Supabase で行うので速く返ります
- Supabase に見つからない店は、OpenStreetMap（Overpass API）に直接問い合わせます。見つかった店は Supabase にも追加されます
- 入力中は、似ているチェーン店名を候補に出します（`data/brands.json`）

## はじめての準備

1. 依存パッケージを入れる：`npm install`
2. Supabase でプロジェクトを作る（無料プラン）
3. Supabase の **SQL Editor** で `supabase/schema.sql` の中身を貼り付けて実行する
4. `.env.example` をコピーして `.env.local` を作り、**Project Settings → API** の値を入れる
   - `SUPABASE_URL`：Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`：service_role キー（秘密。画面側のコードやGitHubに出さない）
5. 店のデータを取り込む（下の「データの取り込み」）
6. 起動：`npm run dev` → http://localhost:3000

## データの取り込み

```bash
npm run import-shops -- --only=東京都   # 1県だけ試す（数分）
npm run import-shops                    # 全国（1時間前後）。終わると data/brands.json も作り直す
```

- OpenStreetMap の公開サーバーに負担をかけないよう、都道府県ごとに間を空けて問い合わせます。混んでいるときは自動で待ってやり直します
- 全国の取り込みが全部成功したときだけ、今回見つからなかった古い店（閉店など）を消します
- 月1回くらい実行すると、データが新しく保たれます。全国を取り込んだら `data/brands.json` をコミットしてください

## 公開（Vercel）

1. このリポジトリを GitHub に上げ、Vercel で Import する（Root Directory はリポジトリのいちばん上のまま）
2. Vercel の **Settings → Environment Variables** に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を入れる
3. `vercel.json` の Cron が毎日1回 `/api/keepalive` を呼び、Supabase 無料プランの一時停止（1週間使われないと止まる）を防ぎます

## 開発

- テスト：`npm test`
- 型チェック：`npx tsc --noEmit`
- 設計書：`docs/superpowers/specs/2026-11-10-restaurant-distribution-map-design.md`

## 出典とライセンス

- 地図・店舗データ：© OpenStreetMap contributors（ODbL 1.0） https://www.openstreetmap.org/copyright
- 都道府県境界：地球地図日本（国土地理院）、dataofjapan/land 経由。詳細は `data/LICENSE-prefectures.md`
- 候補のチェーン店名：Name Suggestion Index（BSD-3-Clause）と OpenStreetMap。詳細は `data/LICENSE-brands.md`
- 営利目的で使う場合は、地球地図日本の著作権者への利用報告が必要です
