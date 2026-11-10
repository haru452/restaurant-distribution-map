// 会社 → チェーンの一覧。「すかいらーく」で検索するとガスト・バーミヤンなどをまとめて出すために使う
import { stripBranch, suffixKey } from "./brandName";
import { looseKey } from "./normalize";
import type { Brand } from "./types";
import type { Ancestor } from "./wikidata";

export type Company = {
  name: string;
  aliases: string[];
  /** 店舗数の多い順 */
  brands: string[];
  count: number;
};

const CORPORATE_WORDS = ["株式会社", "（株）", "(株)", "ホールディングス", "グループ", "カンパニーズ", "カンパニー"];

/** 「すかいらーくホールディングス」→「すかいらーく」 */
export function shortCompanyName(name: string): string {
  let s = name;
  for (const w of CORPORATE_WORDS) s = s.split(w).join("");
  s = s.trim();
  return s.length >= 2 ? s : name;
}

/** 各チェーンで一番多く付いているブランドIDを選ぶ（minVotes 票未満は選ばない） */
export function voteBrandIds(
  shops: { name: string; brand?: string; wikidata?: string }[],
  brands: Brand[],
  minVotes = 2,
): Map<string, string> {
  const owner = new Map<string, string>();
  for (const b of brands) for (const n of [b.name, ...b.aliases]) if (!owner.has(suffixKey(n))) owner.set(suffixKey(n), b.name);

  const votes = new Map<string, Map<string, number>>();
  for (const shop of shops) {
    if (!shop.wikidata) continue;
    const brand = owner.get(suffixKey(shop.brand?.trim() || stripBranch(shop.name)));
    if (!brand) continue;
    const v = votes.get(brand) ?? new Map<string, number>();
    v.set(shop.wikidata, (v.get(shop.wikidata) ?? 0) + 1);
    votes.set(brand, v);
  }

  const out = new Map<string, string>();
  for (const [brand, v] of votes) {
    const [qid, n] = [...v].sort((a, b) => b[1] - a[1])[0];
    if (n >= minVotes) out.set(brand, qid);
  }
  return out;
}

/** チェーンのブランドIDと、その親会社のたどり結果から、会社ごとのチェーン一覧を作る */
export function buildCompanies(brandIds: Map<string, string>, ancestors: Map<string, Ancestor[]>, brands: Brand[]): Company[] {
  const brandKeys = new Set(brands.flatMap((b) => [b.name, ...b.aliases]).map(suffixKey));
  const countOf = new Map(brands.map((b) => [b.name, b.count]));
  const byQid = new Map<string, { label: Ancestor; brands: Set<string> }>();

  for (const [brand, qid] of brandIds) {
    for (const a of ancestors.get(qid) ?? []) {
      const label = a.ja ?? a.en;
      // チェーンと同じ名前のもの（ブランド自身の項目）は会社にしない
      if (!label || brandKeys.has(suffixKey(label))) continue;
      const entry = byQid.get(a.qid) ?? { label: a, brands: new Set<string>() };
      entry.brands.add(brand);
      byQid.set(a.qid, entry);
    }
  }

  const companies: Company[] = [];
  for (const { label, brands: set } of byQid.values()) {
    const name = (label.ja ?? label.en)!;
    const aliases = [...new Set([shortCompanyName(name), label.en].filter((a): a is string => !!a && a !== name))].filter(
      (a) => !brandKeys.has(suffixKey(a)),
    );
    const list = [...set].sort((a, b) => (countOf.get(b) ?? 0) - (countOf.get(a) ?? 0));
    companies.push({ name, aliases, brands: list, count: list.reduce((s, b) => s + (countOf.get(b) ?? 0), 0) });
  }
  return companies.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}

/**
 * 検索語に合う会社を探す。会社名・別名と同じか、先頭3文字以上が一致すれば見つける。
 * brands を渡すと、チェーン名と同じ語（例：吉野家）は会社として扱わない。
 */
export function findCompany(query: string, companies: Company[], brands: Brand[] = []): Company | null {
  const q = looseKey(query);
  if ([...q].length < 3) return null;
  if (brands.some((b) => [b.name, ...b.aliases].some((n) => suffixKey(n) === suffixKey(query)))) return null;
  for (const c of companies) {
    const keys = [c.name, ...c.aliases].map(looseKey);
    if (keys.some((k) => k === q || k.startsWith(q))) return c;
  }
  return null;
}
