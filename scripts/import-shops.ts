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
import { buildCompanies, voteBrandIds } from "../lib/companies";
import type { Brand } from "../lib/types";
import { fetchAncestors } from "../lib/wikidata";
import { fetchNsiBrands, fetchPrefectureShops } from "../lib/importQuery";
import { createShopStore, supabaseFromEnv } from "../lib/shopStore";

const WAIT_BETWEEN_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Supabase に入っている店の名前とブランドを全部読む（--brands-only 用） */
async function readNamesFromSupabase() {
  const db = supabaseFromEnv();
  if (!db) throw new Error(".env.local に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
  const names: { name: string; brand?: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("shops").select("name,brand").order("osm_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) names.push({ name: row.name, brand: row.brand ?? undefined });
    if ((data ?? []).length < 1000) break;
  }
  return names;
}

async function writeBrands(names: { name: string; brand?: string }[]) {
  const brands = aggregateBrands(names, await fetchNsiBrands());
  const out = path.join(process.cwd(), "data", "brands.json");
  writeFileSync(out, JSON.stringify(brands));
  console.log(`brands.json: ${brands.length}件、上位: ${brands.slice(0, 20).map((b) => `${b.name}(${b.count})`).join("、")}`);
  return brands;
}

/** 店に付いているブランドIDから親会社をたどり、data/companies.json を作る */
async function writeCompanies(names: { name: string; brand?: string; wikidata?: string }[], brands: Brand[]) {
  const ids = voteBrandIds(names, brands);
  console.log(`ブランドIDが分かったチェーン: ${ids.size}件。Wikidata で親会社を調べます`);
  const ancestors = await fetchAncestors([...ids.values()]);
  const companies = buildCompanies(ids, ancestors, brands);
  writeFileSync(path.join(process.cwd(), "data", "companies.json"), JSON.stringify(companies));
  console.log(`companies.json: ${companies.length}件、上位: ${companies.slice(0, 10).map((c) => `${c.name}(${c.brands.slice(0, 4).join("/")})`).join("、")}`);
}

async function main() {
  // --brands-only：取り込みはせず、Supabase の店から brands.json だけ作り直す
  if (process.argv.includes("--brands-only")) {
    const names = await readNamesFromSupabase();
    console.log(`Supabase から ${names.length}件を読みました`);
    await writeBrands(names);
    return;
  }
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
  const names: { name: string; brand?: string; wikidata?: string }[] = [];
  const failed: string[] = [];
  let total = 0;

  for (const [i, prefecture] of targets.entries()) {
    const started = Date.now();
    try {
      const shops = await fetchPrefectureShops(prefecture);
      await store.upsert(shops.map((s) => ({ ...s, prefecture })), runStart);
      for (const s of shops) names.push({ name: s.name, brand: s.brand, wikidata: s.brandWikidata });
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

  const brands = await writeBrands(names);
  await writeCompanies(names, brands);
}

main()
  .then(() => process.exit(0)) // Supabase の接続が残ってプロセスが終わらないため
  .catch((e) => {
  console.error(e);
  process.exit(1);
});
