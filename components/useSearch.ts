"use client";
// 検索の状態管理。新しい検索を始めたら前の検索は止める
import { useCallback, useRef, useState } from "react";
import { isValidQuery, normalizeQuery } from "@/lib/normalize";
import type { SearchResult } from "@/lib/types";

export type SearchState = "idle" | "loading" | "done" | "error";
export type SearchError = "busy" | "internal";

export function useSearch() {
  const [state, setState] = useState<SearchState>("idle");
  const [result, setResult] = useState<SearchResult>();
  const [error, setError] = useState<SearchError>();
  const controllerRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string>("");

  const search = useCallback(async (input: string) => {
    const q = normalizeQuery(input);
    if (!isValidQuery(q)) return;
    lastQueryRef.current = q;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("loading");
    setError(undefined);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (res.status === 503) throw Object.assign(new Error("busy"), { kind: "busy" as const });
      if (!res.ok) throw Object.assign(new Error("internal"), { kind: "internal" as const });
      const body = (await res.json()) as SearchResult;
      if (controller.signal.aborted) return;
      setResult(body);
      setState("done");
    } catch (e) {
      if (controller.signal.aborted) return; // 新しい検索に置き換わった
      setError((e as { kind?: SearchError }).kind ?? "internal");
      setState("error");
    }
  }, []);

  const retry = useCallback(() => {
    if (lastQueryRef.current) void search(lastQueryRef.current);
  }, [search]);

  return { state, result, error, search, retry };
}
