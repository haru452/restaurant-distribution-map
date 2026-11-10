"use client";
// ヒートマップ表示
import { useEffect } from "react";
import type L from "leaflet";
import { HeatLayer as LeafletHeatLayer } from "leaflet.heat";
import type { SearchResult } from "@/lib/types";

export function HeatLayer({ map, result }: { map: L.Map; result: SearchResult }) {
  useEffect(() => {
    const points = result.shops.map((s) => [s.lat, s.lon, 1] as [number, number, number]);
    // leaflet.heat 1.0 の型は L.Layer を継承していると読めないため、L.Layer として扱う
    const layer = new LeafletHeatLayer(points, { radius: 22, blur: 18, minOpacity: 0.35, max: 3 }) as unknown as L.Layer;
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, result]);
  return null;
}
