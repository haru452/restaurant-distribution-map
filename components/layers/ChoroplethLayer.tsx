"use client";
// 都道府県の色分け表示。境界データはこの表示を選んだときだけ読み込む
// missing を渡すと、店がない県をグレーの斜線で塗る
import { useEffect } from "react";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { SearchResult } from "@/lib/types";

// 店の数に応じた5段階の濃さ（薄い→濃い）
const SHADES = ["#fde3d9", "#f9b49c", "#f0805f", "#d9482b", "#9e2a14"];
const HATCH_ID = "missing-hatch";

function shadeFor(count: number, max: number): string {
  const ratio = count / max;
  const index = Math.min(SHADES.length - 1, Math.floor(ratio * SHADES.length));
  return SHADES[index];
}

/** 地図の SVG に斜線の模様を1回だけ用意する */
function ensureHatch(map: L.Map) {
  const svg = map.getPanes().overlayPane.querySelector("svg");
  if (!svg || svg.querySelector(`#${HATCH_ID}`)) return;
  const ns = "http://www.w3.org/2000/svg";
  const defs = svg.querySelector("defs") ?? svg.insertBefore(document.createElementNS(ns, "defs"), svg.firstChild);
  const pattern = document.createElementNS(ns, "pattern");
  pattern.setAttribute("id", HATCH_ID);
  pattern.setAttribute("width", "8");
  pattern.setAttribute("height", "8");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("patternTransform", "rotate(45)");
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("width", "8");
  bg.setAttribute("height", "8");
  bg.setAttribute("fill", "#d1d5db");
  const line = document.createElementNS(ns, "rect");
  line.setAttribute("width", "3");
  line.setAttribute("height", "8");
  line.setAttribute("fill", "#6b7280");
  pattern.append(bg, line);
  defs.appendChild(pattern);
}

export function ChoroplethLayer({ map, result, missing }: { map: L.Map; result: SearchResult; missing?: string[] }) {
  useEffect(() => {
    let layer: L.GeoJSON | null = null;
    let cancelled = false;
    const counts = new Map(result.byPrefecture.map((p) => [p.prefecture, p.count]));
    const max = Math.max(1, ...counts.values());
    const missingSet = new Set(missing ?? []);

    void import("@/data/prefectures.json").then((mod) => {
      if (cancelled) return;
      const data = mod.default as unknown as FeatureCollection;
      layer = L.geoJSON(data, {
        style: (feature?: Feature) => {
          const name = feature?.properties?.name;
          const count = counts.get(name) ?? 0;
          if (missingSet.has(name)) return { color: "#4b5563", weight: 1.5, fillColor: "#9ca3af", fillOpacity: 0.85 };
          return {
            color: "#8a827a",
            weight: 1,
            fillColor: count > 0 ? shadeFor(count, max) : "transparent",
            fillOpacity: count > 0 ? (missing ? 0.35 : 0.75) : 0,
          };
        },
        onEachFeature: (feature, l) => {
          const name: string = feature.properties?.name ?? "";
          const count = counts.get(name) ?? 0;
          l.bindPopup(`<strong>${name}</strong> ${count > 0 ? `${count.toLocaleString()}店` : "店がありません"}`);
        },
      }).addTo(map);

      // 店がない県は斜線にする（SVG の模様で塗る）
      if (missingSet.size > 0) {
        ensureHatch(map);
        layer.eachLayer((l) => {
          const f = (l as L.Path & { feature?: Feature }).feature;
          const path = (l as unknown as { _path?: SVGPathElement })._path;
          if (f && missingSet.has(f.properties?.name) && path) path.setAttribute("fill", `url(#${HATCH_ID})`);
        });
      }
    });
    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [map, result, missing]);
  return null;
}
