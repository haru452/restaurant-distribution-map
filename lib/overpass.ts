// OpenStreetMap（Overpass API）への問い合わせ
import type { RawShop } from "./types";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const USER_AGENT = "restaurant-distribution-map/1.0";
export const AMENITIES = ["restaurant", "fast_food", "cafe", "food_court", "pub", "bar"] as const;
export const AMENITY_REGEX = `^(${AMENITIES.join("|")})$`;
export const MAX_SHOPS = 5000;

/** Overpass が混雑・時間切れのとき */
export class OverpassBusyError extends Error {
  constructor(message = "Overpass API is busy") {
    super(message);
    this.name = "OverpassBusyError";
  }
}

// 大きい字 ⇔ 小さい字（カタカナ）
const SIZE_PAIRS: Record<string, string> = {
  ア: "ァ", イ: "ィ", ウ: "ゥ", エ: "ェ", オ: "ォ", ツ: "ッ",
  ヤ: "ャ", ユ: "ュ", ヨ: "ョ", ワ: "ヮ", カ: "ヵ", ケ: "ヶ",
};
for (const [large, small] of Object.entries(SIZE_PAIRS)) SIZE_PAIRS[small] = large;

const REGEX_SPECIAL = new Set("\\^$.|?*+()[]{}");
const toHiragana = (kata: string) => String.fromCharCode(kata.charCodeAt(0) - 0x60);
const isKatakana = (c: string) => c >= "ァ" && c <= "ヶ";

/** normalizeQuery 済みの検索語から、Overpass 用の正規表現を作る */
export function buildPattern(normalized: string): string {
  let out = "";
  for (const c of normalized) {
    if (c === "ー") {
      out += "ー?";
    } else if (isKatakana(c)) {
      const chars = [c, toHiragana(c)];
      const pair = SIZE_PAIRS[c];
      if (pair) chars.push(pair, toHiragana(pair));
      out += `[${chars.join("")}]`;
    } else if (REGEX_SPECIAL.has(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return out;
}

const qlString = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function buildQuery(normalized: string): string {
  const p = qlString(buildPattern(normalized));
  const lines = ["name", "name:ja", "brand", "brand:ja"].map(
    (tag) => `  nwr(area.jp)["amenity"~"${AMENITY_REGEX}"]["${tag}"~"${p}",i];`,
  );
  return [
    "[out:json][timeout:50];",
    'area["ISO3166-1"="JP"][admin_level=2]->.jp;',
    "(",
    ...lines,
    ");",
    `out center ${MAX_SHOPS + 1};`,
  ].join("\n");
}

type Element = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const ADDRESS_PARTS = ["addr:province", "addr:city", "addr:quarter", "addr:neighbourhood", "addr:block_number", "addr:housenumber"];

function buildAddress(tags: Record<string, string>): string | undefined {
  if (tags["addr:full"]) return tags["addr:full"];
  const joined = ADDRESS_PARTS.map((k) => tags[k] ?? "").join("");
  return joined || undefined;
}

export function parseElements(json: unknown): RawShop[] {
  const elements = (json as { elements?: Element[] })?.elements ?? [];
  const shops: RawShop[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name ?? tags["name:ja"] ?? tags.brand;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lon === undefined) continue;
    const address = buildAddress(tags);
    shops.push(address ? { name, lat, lon, address } : { name, lat, lon });
  }
  return shops;
}

/** Overpass に問い合わせて文字列を返す（スクリプトからも使う） */
export async function runOverpass(query: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "AbortError" || name === "TimeoutError") throw new OverpassBusyError("timeout");
    throw e;
  }
  if (response.status === 429 || response.status === 504) throw new OverpassBusyError(`status ${response.status}`);
  if (!response.ok) throw new Error(`Overpass error: status ${response.status}`);
  const json = (await response.json()) as { remark?: string };
  if (json.remark && /timed out|runtime error|out of memory/i.test(json.remark)) {
    throw new OverpassBusyError(json.remark);
  }
  return json;
}

export async function fetchShops(
  normalized: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ shops: RawShop[]; truncated: boolean }> {
  const shops = parseElements(await runOverpass(buildQuery(normalized), fetchImpl));
  const truncated = shops.length > MAX_SHOPS;
  return { shops: truncated ? shops.slice(0, MAX_SHOPS) : shops, truncated };
}
