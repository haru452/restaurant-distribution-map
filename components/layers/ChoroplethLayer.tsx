"use client";
// 都道府県の色分け表示。境界データはこの表示を選んだときだけ読み込む
import { useEffect } from "react";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { SearchResult } from "@/lib/types";

// 店の数に応じた5段階の濃さ（薄い→濃い）
const SHADES = ["#fde3d9", "#f9b49c", "#f0805f", "#d9482b", "#9e2a14"];

function shadeFor(count: number, max: number): string {
  const ratio = count / max;
  const index = Math.min(SHADES.length - 1, Math.floor(ratio * SHADES.length));
  return SHADES[index];
}

export function ChoroplethLayer({ map, result }: { map: L.Map; result: SearchResult }) {
  useEffect(() => {
    let layer: L.GeoJSON | null = null;
    let cancelled = false;
    const counts = new Map(result.byPrefecture.map((p) => [p.prefecture, p.count]));
    const max = Math.max(1, ...counts.values());

    void import("@/data/prefectures.json").then((mod) => {
      if (cancelled) return;
      const data = mod.default as unknown as FeatureCollection;
      layer = L.geoJSON(data, {
        style: (feature?: Feature) => {
          const count = counts.get(feature?.properties?.name) ?? 0;
          return {
            color: "#8a827a",
            weight: 1,
            fillColor: count > 0 ? shadeFor(count, max) : "transparent",
            fillOpacity: count > 0 ? 0.75 : 0,
          };
        },
        onEachFeature: (feature, l) => {
          const name: string = feature.properties?.name ?? "";
          l.bindPopup(`<strong>${name}</strong> ${(counts.get(name) ?? 0).toLocaleString()}店`);
        },
      }).addTo(map);
    });
    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [map, result]);
  return null;
}
