// 日本の飲食店を OpenStreetMap から都道府県ごとに取り、Supabase の shops 表に入れる。
// 全国を取り込んだときは data/brands.json（誤字の候補用）も作り直す。
//
// 使い方：
//   npm run import-shops                 全国（1時間前後）
//   npm run import-shops -- --only=東京都  1県だけ（試し用。古い行の削除と brands.json の作成はしない）
import { writeFileSync } from "node:fs";
import path from "node:path";
import prefectureData from "../data/prefectures.json";
import { aggregateBrands } from "../lib/brandName";
import { buildPrefectureQuery, fetchNsiBrands } from "../lib/importQuery";
import { parseElements, runOverpass } from "../lib/overpass";
import { createShopStore } from "../lib/shopStore";

const WAIT_BETWEEN_MS = 10_000;
const WAIT_RETRY_MS = 60_000;
const MAX_TRIES = 5;
const OVERPASS_TIMEOUT_MS = 10 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPrefecture(prefecture: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return parseElements(await runOverpass(buildPrefectureQuery(prefecture), fetch, OVERPASS_TIMEOUT_MS));
    } catch (e) {
      if (attempt >= MAX_TRIES) throw e;
      console.warn(`  ${prefecture}: ${(e as Error).message}（${attempt}回目）。${WAIT_RETRY_MS / 1000}秒待ってやり直します`);
      await sleep(WAIT_RETRY_MS);
    }
  }
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const store = createShopStore();
  if (!store) {
    console.error(".env.local に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
    process.exit(1);
  }

  const all = (prefectureData as { features: { properties: { name: string } }[] }).features.map((f) => f.properties.name);
  const targets = only ? all.filter((p) => p === only) : all;
  if (targets.length === 0) {
    console.error(`都道府県名が見つかりません: ${only}`);
    process.exit(1);
  }

  const runStart = new Date();
  const names: { name: string; brand?: string }[] = [];
  const failed: string[] = [];
  let total = 0;

  for (const [i, prefecture] of targets.entries()) {
    const started = Date.now();
    try {
      const shops = await fetchPrefecture(prefecture);
      await store.upsert(shops.map((s) => ({ ...s, prefecture })), runStart);
      for (const s of shops) names.push({ name: s.name, brand: s.brand });
      total += shops.length;
      console.log(`[${i + 1}/${targets.length}] ${prefecture}: ${shops.length}件（${Math.round((Date.now() - started) / 1000)}秒）`);
    } catch (e) {
      failed.push(prefecture);
      console.error(`[${i + 1}/${targets.length}] ${prefecture}: 失敗 ${(e as Error).message}`);
    }
    if (i < targets.length - 1) await sleep(WAIT_BETWEEN_MS);
  }

  console.log(`取り込み: ${total}件`);
  if (failed.length > 0) {
    console.error(`失敗した都道府県: ${failed.join("、")}。もう一度 --only=県名 で取り込んでください`);
    process.exit(1);
  }
  if (only) return;

  const removed = await store.deleteOlderThan(runStart);
  console.log(`古い行を削除: ${removed}件`);

  const brands = aggregateBrands(names, await fetchNsiBrands());
  const out = path.join(process.cwd(), "data", "brands.json");
  writeFileSync(out, JSON.stringify(brands));
  console.log(`brands.json: ${brands.length}件、上位: ${brands.slice(0, 20).map((b) => `${b.name}(${b.count})`).join("、")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
