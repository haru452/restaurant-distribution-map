import type { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { fetchShops } from "@/lib/overpass";
import { handleSearch } from "@/lib/search";
import { createShopStore } from "@/lib/shopStore";
import { findCompanyByQuery } from "@/lib/companyLookup";

export const maxDuration = 60;

const CACHE_OK = "public, s-maxage=86400, stale-while-revalidate=86400";

export async function GET(request: NextRequest) {
  const { status, body, cacheable } = await handleSearch(request.nextUrl.searchParams.get("q"), {
    store: createShopStore(),
    findCompany: findCompanyByQuery,
    fetchShops,
    background: waitUntil,
  });
  return Response.json(body, {
    status,
    headers: { "Cache-Control": cacheable ? CACHE_OK : "no-store" },
  });
}
