import type { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createGemini } from "@/lib/gemini";
import { handleInsight } from "@/lib/insight";
import { createInsightStore } from "@/lib/insightStore";
import { fetchShops } from "@/lib/overpass";
import { handleSearch } from "@/lib/search";
import { createShopStore } from "@/lib/shopStore";
import { findCompanyByQuery } from "@/lib/companyLookup";
import type { SearchResult } from "@/lib/types";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const shopStore = createShopStore();
  const { status, body } = await handleInsight(request.nextUrl.searchParams.get("q"), {
    cache: createInsightStore(),
    gemini: createGemini(),
    search: async (query) => {
      const r = await handleSearch(query, { store: shopStore, fetchShops, background: waitUntil, findCompany: findCompanyByQuery });
      if (r.status !== 200) throw new Error(`search failed: ${r.status}`);
      return r.body as SearchResult;
    },
  });
  return Response.json(body, {
    status,
    headers: { "Cache-Control": status === 200 ? "public, s-maxage=86400, stale-while-revalidate=86400" : "no-store" },
  });
}
