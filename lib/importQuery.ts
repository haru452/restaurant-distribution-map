// 取り込みスクリプト用：都道府県ごとの問い合わせ文と、Name Suggestion Index の読み込み
import { AMENITIES, AMENITY_REGEX } from "./overpass";
import type { Brand } from "./types";

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
export async function fetchNsiBrands(fetchImpl: typeof fetch = fetch): Promise<Brand[]> {
  const brands: Brand[] = [];
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
      brands.push({ name, aliases: [...new Set(aliases)], count: 0 });
    }
  }
  return brands;
}
