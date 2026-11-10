import { createGemini } from "./lib/gemini";
import { buildInsightPrompt, parseInsight } from "./lib/insight";
import { createShopStore } from "./lib/shopStore";
import { handleSearch } from "./lib/search";
import { fetchShops } from "./lib/overpass";
import type { SearchResult } from "./lib/types";
async function main() {
  const r = (await handleSearch("スシロー", { store: createShopStore(), fetchShops, background: () => {} })).body as SearchResult;
  for (const model of (process.argv[2] ?? "").split(",")) {
    process.env.GEMINI_MODEL = model;
    const t = Date.now();
    try {
      const a = await createGemini()!(buildInsightPrompt(r));
      console.log(`== ${model}: ${((Date.now() - t) / 1000).toFixed(1)}s webChecked=${a.webChecked} sources=${a.sources.length}`);
      console.log(JSON.stringify(parseInsight(a.text), null, 1));
    } catch (e) { console.log(`== ${model}: ERR ${(e as Error).message.slice(0, 160)}`); }
  }
}
main().then(() => process.exit(0));
