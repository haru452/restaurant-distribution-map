"use client";
// 候補用のチェーン店名一覧を、最初に必要になったときに1回だけ読み込む
import { useEffect, useState } from "react";
import type { Company } from "@/lib/companies";
import type { Brand } from "@/lib/types";

let cache: Promise<Brand[]> | null = null;

/** 会社を候補の形にする（例：「すかいらーく」— ガスト、バーミヤン、夢庵など） */
function companyToBrand(c: Company): Brand {
  const name = c.aliases[0] ?? c.name;
  return {
    name,
    aliases: [c.name, ...c.aliases.slice(1)].filter((a) => a !== name),
    count: c.count,
    note: `${c.brands.slice(0, 3).join("、")}${c.brands.length > 3 ? "など" : ""}`,
  };
}

export function loadBrands(): Promise<Brand[]> {
  cache ??= Promise.all([
    import("@/data/brands.json").then((m) => m.default as Brand[]).catch(() => [] as Brand[]),
    import("@/data/companies.json").then((m) => (m.default as Company[]).filter((c) => c.brands.length >= 2).map(companyToBrand)).catch(() => [] as Brand[]),
  ]).then(([brands, companies]) => [...brands, ...companies]);
  return cache;
}

/** enabled になったら読み込みを始める */
export function useBrands(enabled: boolean): Brand[] {
  const [brands, setBrands] = useState<Brand[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadBrands().then((b) => alive && setBrands(b));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return brands;
}
