// 取り込みスクリプト用：都道府県ごとの問い合わせ文と、Name Suggestion Index の読み込み
import { AMENITIES, AMENITY_REGEX, parseElements, runOverpass } from "./overpass";
import type { NsiBrand } from "./brandName";
import type { OsmShop } from "./types";

type FetchOptions = { fetchImpl?: typeof fetch; tries?: number; waitMs?: number; timeoutMs?: number };

/**
 * 1つの都道府県の店を取る。失敗や0件はやり直し、それでもだめなら例外。
 * 0件を成功扱いにすると、取り込み後の「古い行の削除」でその県の店が全部消えるため。
 */
export async function fetchPrefectureShops(
  prefecture: string,
  { fetchImpl = fetch, tries = 5, waitMs = 60_000, timeoutMs = 10 * 60_000 }: FetchOptions = {},
): Promise<OsmShop[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const shops = parseElements(await runOverpass(buildPrefectureQuery(prefecture), fetchImpl, timeoutMs));
      if (shops.length === 0) throw new Error(`${prefecture}: 0件でした`);
      return shops;
    } catch (e) {
      if (attempt >= tries) throw e;
      console.warn(`  ${prefecture}: ${(e as Error).message}（${attempt}回目）。${waitMs / 1000}秒待ってやり直します`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

const NSI_BASE = "https://raw.githubusercontent.com/osmlab/name-suggestion-index/main/data/brands/amenity";

/** 1つの都道府県の、名前のある飲食店をすべて取る問い合わせ */
export function buildPrefectureQuery(prefecture: string): string {
  return [
    "[out:json][timeout:300];",
    `area["name"="${prefecture}"]["admin_level"="4"]->.p;`,
    `nwr(area.p)["amenity"~"${AMENITY_REGEX}"][~"^(name|name:ja|brand|brand:ja)$"~"."];`,
    "out center tags;",
  ].join("\n");
}

type NsiItem = { locationSet?: { include?: string[] }; tags?: Record<string, string> };

/** NSI から日本向けの飲食チェーン名を取る（count は 0） */
export async function fetchNsiBrands(fetchImpl: typeof fetch = fetch): Promise<NsiBrand[]> {
  const brands: NsiBrand[] = [];
  for (const amenity of AMENITIES) {
    const res = await fetchImpl(`${NSI_BASE}/${amenity}.json`);
    if (!res.ok) {
      console.warn(`[nsi] ${amenity}: status ${res.status}、飛ばします`);
      continue;
    }
    const { items = [] } = (await res.json()) as { items?: NsiItem[] };
    for (const item of items) {
      if (!item.locationSet?.include?.includes("jp")) continue;
      const tags = item.tags ?? {};
      const name = tags["name:ja"] ?? tags["brand:ja"] ?? tags.name;
      if (!name) continue;
      const aliases = [tags.name, tags["name:ja"], tags.brand, tags["brand:ja"], tags["name:en"]]
        .filter((v): v is string => !!v && v !== name);
      const brand: NsiBrand = { name, aliases: [...new Set(aliases)], count: 0 };
      if (tags["brand:wikidata"]) brand.wikidata = tags["brand:wikidata"];
      brands.push(brand);
    }
  }
  return brands;
}
