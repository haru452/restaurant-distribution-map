"use client";
// AIの考察で分かった本社・創業の地の県を、太い点線の枠で目立たせる
import { useEffect } from "react";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";

export function HqOutline({ map, prefecture }: { map: L.Map; prefecture: string }) {
  useEffect(() => {
    let layer: L.GeoJSON | null = null;
    let cancelled = false;
    void import("@/data/prefectures.json").then((mod) => {
      if (cancelled) return;
      const data = mod.default as unknown as FeatureCollection;
      const features = data.features.filter((f: Feature) => f.properties?.name === prefecture);
      if (features.length === 0) return;
      layer = L.geoJSON({ type: "FeatureCollection", features } as FeatureCollection, {
        style: { color: "#1d4ed8", weight: 4, dashArray: "8 6", fill: false },
        interactive: false,
      }).addTo(map);
      layer.bringToFront();
    });
    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [map, prefecture]);
  return null;
}
