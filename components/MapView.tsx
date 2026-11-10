"use client";
// 地図と表示の切り替え。Leaflet はブラウザ専用なので App から ssr: false で読み込む
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SearchResult } from "@/lib/types";
import { ChoroplethLayer } from "./layers/ChoroplethLayer";
import { HeatLayer } from "./layers/HeatLayer";
import { PinLayer } from "./layers/PinLayer";

export type ViewMode = "heat" | "choropleth" | "pins";

const MODES: { id: ViewMode; label: string }[] = [
  { id: "heat", label: "ヒートマップ" },
  { id: "choropleth", label: "都道府県" },
  { id: "pins", label: "ピン" },
];

const JAPAN_CENTER: L.LatLngTuple = [37.5, 137.5];
const japanZoom = () => (window.innerWidth < 640 ? 4 : 5);

export default function MapView({ result }: { result?: SearchResult }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [mode, setMode] = useState<ViewMode>("heat");

  useEffect(() => {
    if (!containerRef.current) return;
    const m = L.map(containerRef.current, { center: JAPAN_CENTER, zoom: japanZoom(), zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.attributionControl.addAttribution("都道府県境界：地球地図日本");
    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
  }, []);

  // 新しい結果が来たら、全店が入る範囲に合わせる
  useEffect(() => {
    if (!map || !result) return;
    if (result.shops.length === 0) {
      map.setView(JAPAN_CENTER, japanZoom());
      return;
    }
    const bounds = L.latLngBounds(result.shops.map((s) => [s.lat, s.lon] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }, [map, result]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div role="group" aria-label="表示の切り替え" className="absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-lg border border-line bg-surface shadow">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`px-3 py-2 text-sm font-bold transition ${mode === m.id ? "bg-accent text-on-accent" : "text-ink hover:bg-accent/10"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {map && result && mode === "heat" && <HeatLayer map={map} result={result} />}
      {map && result && mode === "choropleth" && <ChoroplethLayer map={map} result={result} />}
      {map && result && mode === "pins" && <PinLayer map={map} result={result} />}
    </div>
  );
}
