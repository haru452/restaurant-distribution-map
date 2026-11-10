// Supabase Free の一時停止を防ぐため、Vercel Cron から毎日呼ばれる
import { connection } from "next/server";
import { createShopStore } from "@/lib/shopStore";

export async function GET() {
  await connection(); // ビルド時に静的化させず、毎回実行する
  const store = createShopStore();
  if (!store) return new Response(null, { status: 204 });
  try {
    await store.ping();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[keepalive]", e);
    return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
