// 似ている店名を探す（ブラウザで動く）
import { looseKey } from "./normalize";
import type { Brand } from "./types";

/** 編集距離（Levenshtein） */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

type Score = { rank: number; distance: number };

/** 入力 q と相手 k の近さ。一致しなければ null */
function scoreKey(q: string, k: string): Score | null {
  const distance = editDistance(q, k);
  if (k.startsWith(q)) return { rank: 0, distance };
  if (k.includes(q)) return { rank: 1, distance };
  const len = [...q].length;
  const tolerance = len <= 4 ? 1 : 2;
  const chars = [...k];
  const partial = [len - 1, len, len + 1]
    .filter((n) => n > 0 && n <= chars.length)
    .map((n) => editDistance(q, chars.slice(0, n).join("")));
  if (Math.min(distance, ...partial) <= tolerance) return { rank: 2, distance };
  return null;
}

const better = (a: Score, b: Score) => a.rank - b.rank || a.distance - b.distance;

export function suggest(input: string, brands: Brand[], limit = 5): Brand[] {
  const q = looseKey(input);
  if ([...q].length <= 1) return [];
  const scored: { brand: Brand; score: Score }[] = [];
  for (const brand of brands) {
    let best: Score | null = null;
    for (const key of [brand.name, ...brand.aliases].map(looseKey)) {
      const s = scoreKey(q, key);
      if (s && (!best || better(s, best) < 0)) best = s;
    }
    if (best) scored.push({ brand, score: best });
  }
  return scored
    .sort((a, b) => better(a.score, b.score) || b.brand.count - a.brand.count || a.brand.name.length - b.brand.name.length)
    .slice(0, limit)
    .map((s) => s.brand);
}
