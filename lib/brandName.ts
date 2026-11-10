// 店名から支店名を取り、チェーン名ごとに数える
import { looseKey } from "./normalize";
import type { Brand } from "./types";

const SEPARATOR = /[ 　・]/;

/** 区切り（空白・「・」）のあとの末尾が「○○店」なら取る */
export function stripBranch(name: string): string {
  const parts = name.trim().split(SEPARATOR).filter(Boolean);
  if (parts.length < 2 || !parts[parts.length - 1].endsWith("店")) return name.trim();
  return parts.slice(0, -1).join(" ");
}

/** 区切りなしで「店」で終わる名前を、先頭が一致する別の店名（3文字以上）にまとめる */
export function mergeUnseparated(counts: Map<string, number>): Map<string, number> {
  const result = new Map(counts);
  const names = [...counts.keys()].sort((a, b) => b.length - a.length); // 長い名前から順にまとめる
  for (const name of names) {
    if (!name.endsWith("店") || SEPARATOR.test(name)) continue;
    let target: string | undefined;
    for (const other of result.keys()) {
      if (other === name || other.length < 3 || !name.startsWith(other)) continue;
      if (!target || other.length > target.length) target = other;
    }
    if (!target) continue;
    result.set(target, (result.get(target) ?? 0) + (result.get(name) ?? 0));
    result.delete(name);
  }
  return result;
}

/** 取り込んだ店からチェーン名を数え、NSI の名前と合わせる（count の多い順） */
export function aggregateBrands(
  shops: { name: string; brand?: string }[],
  nsi: Brand[],
  minCount = 3,
): Brand[] {
  const raw = new Map<string, number>();
  for (const shop of shops) {
    const key = shop.brand?.trim() || stripBranch(shop.name);
    raw.set(key, (raw.get(key) ?? 0) + 1);
  }
  const counts = mergeUnseparated(raw);

  // looseKey が同じものを1つにまとめる。NSI の名前を優先する
  const byKey = new Map<string, Brand>();
  const keyOwner = new Map<string, Brand>();
  for (const entry of nsi) {
    const existing = keyOwner.get(looseKey(entry.name));
    const brand = existing ?? { name: entry.name, aliases: [], count: 0 };
    for (const alias of entry.aliases) if (alias !== brand.name && !brand.aliases.includes(alias)) brand.aliases.push(alias);
    if (!existing) byKey.set(looseKey(entry.name), brand);
    for (const k of [entry.name, ...entry.aliases]) if (!keyOwner.has(looseKey(k))) keyOwner.set(looseKey(k), brand);
  }

  const osmSorted = [...counts].filter(([, n]) => n >= minCount).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of osmSorted) {
    const owner = keyOwner.get(looseKey(name));
    if (owner) {
      owner.count += count;
      if (owner.name !== name && !owner.aliases.includes(name)) owner.aliases.push(name);
      continue;
    }
    const brand: Brand = { name, aliases: [], count };
    byKey.set(looseKey(name), brand);
    keyOwner.set(looseKey(name), brand);
  }

  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}
