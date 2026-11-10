// 考察の保存と、Gemini の1日の利用回数（Supabase）。サーバー側だけで使う
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Insight, InsightCache } from "./insight";
import { supabaseFromEnv } from "./shopStore";

export function createInsightStore(client?: SupabaseClient): InsightCache | null {
  const db = client ?? supabaseFromEnv();
  if (!db) return null;
  return {
    async get(query) {
      const { data, error } = await db.from("insights").select("insight").eq("query", query).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.insight as Insight | undefined) ?? null;
    },
    async save(query, insight) {
      const { error } = await db
        .from("insights")
        .upsert({ query, insight, created_at: insight.createdAt }, { onConflict: "query" });
      if (error) throw new Error(error.message);
    },
    async tryUse(limit) {
      const { data, error } = await db.rpc("use_gemini", { daily_limit: limit });
      if (error) throw new Error(error.message);
      return data === true;
    },
  };
}
