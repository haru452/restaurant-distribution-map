"use client";
// 候補用のチェーン店名一覧を、最初に必要になったときに1回だけ読み込む
import { useEffect, useState } from "react";
import type { Brand } from "@/lib/types";

let cache: Promise<Brand[]> | null = null;

export function loadBrands(): Promise<Brand[]> {
  cache ??= import("@/data/brands.json").then((m) => m.default as Brand[]).catch(() => []);
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
