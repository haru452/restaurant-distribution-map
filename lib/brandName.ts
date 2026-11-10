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
      // 「コメダ珈琲店」と「コメダ」のような語尾だけの違いは、aggregateBrands が別名として残すのでここではまとめない
      if (suffixKey(name) === suffixKey(other)) continue;
      if (!target || other.length > target.length) target = other;
    }
    if (!target) continue;
    result.set(target, (result.get(target) ?? 0) + (result.get(name) ?? 0));
    result.delete(name);
  }
  return result;
}

/** NSI の項目（ブランドIDつき） */
export type NsiBrand = Brand & { wikidata?: string };

// 同じチェーンの書き方の違いとしてよく出る語尾（長いものから順に試す）
const GENERIC_SUFFIXES = ["コーヒーショップ", "コーヒー店", "珈琲店", "コーヒー", "珈琲", "本店", "店"].map(looseKey);

/** 語尾の違いを無視した比較用のキー（「コメダ珈琲店」「コメダ珈琲」「コメダ」→ 同じ） */
export function suffixKey(name: string): string {
  const key = looseKey(name);
  for (const suffix of GENERIC_SUFFIXES) {
    if (key.endsWith(suffix) && [...key].length - [...suffix].length >= 2) return key.slice(0, -suffix.length);
  }
  return key;
}

const MAX_ALIASES = 10;

/**
 * 取り込んだ店からチェーン名を数え、NSI の名前と合わせる（count の多い順）。
 * 語尾の違いだけの名前（NSI の別名を含む）は1つのチェーンにまとめ、
 * ブランドID（Wikidata）は会社のIDが付いていることがあり、別チェーンがまとまってしまうので使わない。
 * 一番店舗数の多い書き方を名前にし、ほかは別名にする。
 */
export function aggregateBrands(
  shops: { name: string; brand?: string; wikidata?: string }[],
  nsi: NsiBrand[],
  minCount = 3,
): Brand[] {
  // 1. 書き方ごとに数える
  const raw = new Map<string, number>();
  for (const shop of shops) {
    const key = shop.brand?.trim() || stripBranch(shop.name);
    raw.set(key, (raw.get(key) ?? 0) + 1);
  }
  const counts = mergeUnseparated(raw);

  // 2. 語尾を除いたキーが同じものを、同じグループにする（Union-Find）
  type Node = { name: string; count: number; nsi?: NsiBrand };
  const nodes: Node[] = [
    ...[...counts].map(([name, count]) => ({ name, count })),
    ...nsi.map((entry) => ({ name: entry.name, count: 0, nsi: entry })),
  ];
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstByKey = new Map<string, number>();
  const link = (key: string, i: number) => {
    const j = firstByKey.get(key);
    if (j === undefined) firstByKey.set(key, i);
    else parent[find(i)] = find(j);
  };
  nodes.forEach((node, i) => {
    const names = node.nsi ? [node.nsi.name, ...node.nsi.aliases] : [node.name];
    for (const n of names) link(`sk:${suffixKey(n)}`, i);
  });

  // 3. グループごとに名前・別名・店舗数を決める
  const groups = new Map<number, Node[]>();
  nodes.forEach((node, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(node);
  });

  const brands: Brand[] = [];
  for (const members of groups.values()) {
    const osm = members.filter((m) => !m.nsi).sort((a, b) => b.count - a.count || b.name.length - a.name.length);
    const fromNsi = members.filter((m) => m.nsi).map((m) => m.nsi!);
    const count = osm.reduce((sum, m) => sum + m.count, 0);
    if (count < minCount && fromNsi.length === 0) continue;
    const name = osm[0]?.name ?? fromNsi[0].name;
    const candidates = [
      ...osm.filter((m) => m.count >= 2).map((m) => m.name),
      ...fromNsi.flatMap((e) => [e.name, ...e.aliases]),
    ];
    const aliases = [...new Set(candidates)].filter((a) => a !== name).slice(0, MAX_ALIASES);
    brands.push({ name, aliases, count });
  }
  return brands.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}
