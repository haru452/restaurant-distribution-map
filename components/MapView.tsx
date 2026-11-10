"use client";
// 地図と表示の切り替え。Leaflet はブラウザ専用なので App から ssr: false で読み込む
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SearchResult } from "@/lib/types";
import { ChoroplethLayer } from "./layers/ChoroplethLayer";
import { HeatLayer } from "./layers/HeatLayer";
import { PinLayer } from "./layers/PinLayer";
import { LocateButton } from "./LocateButton";
import { HqOutline } from "./layers/HqOutline";

export type ViewMode = "heat" | "choropleth" | "pins";

const MODES: { id: ViewMode; label: string }[] = [
  { id: "heat", label: "ヒートマップ" },
  { id: "choropleth", label: "都道府県" },
  { id: "pins", label: "ピン" },
];

const JAPAN_CENTER: L.LatLngTuple = [37.5, 137.5];
const japanZoom = () => (window.innerWidth < 640 ? 4 : 5);

type Props = {
  result?: SearchResult;
  hqPrefecture?: string | null;
  /** 店がない県を見ているときの県の一覧（見ていなければ null） */
  missing?: string[] | null;
  /** 店がない県の表示をやめる */
  onHideMissing?: () => void;
};

export default function MapView({ result, hqPrefecture, missing, onHideMissing }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [chosenMode, setMode] = useState<ViewMode>("choropleth");
  const [showHint, setShowHint] = useState(false);
  // 店がない県を見ている間は、県の塗り分けが見える「都道府県」表示にする
  const mode: ViewMode = missing ? "choropleth" : chosenMode;

  useEffect(() => {
    if (!containerRef.current) return;
    const m = L.map(containerRef.current, { center: JAPAN_CENTER, zoom: japanZoom(), zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.attributionControl.addAttribution("都道府県境界：地球地図日本");

    // タッチ操作では1本指で地図を動かさない（ページのスクロールにする）。
    // 2本指のときは Leaflet のピンチ操作で動かしたり拡大したりできる
    const el = containerRef.current;
    let hideTimer: number | undefined;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        setShowHint(true);
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setShowHint(false), 1500);
      } else {
        setShowHint(false);
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      // 指で触ったときだけドラッグを止める（マウスではこれまで通り動かせる）
      m.dragging.disable();
      if (e.touches.length >= 2) setShowHint(false);
    };
    const onMouseDown = () => m.dragging.enable();
    el.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("mousedown", onMouseDown, { capture: true });
    if (window.matchMedia("(pointer: coarse)").matches) m.dragging.disable();

    setMap(m);
    return () => {
      window.clearTimeout(hideTimer);
      el.removeEventListener("touchstart", onTouchStart, { capture: true });
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("mousedown", onMouseDown, { capture: true });
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
      <div
        aria-hidden={!showHint}
        className={`pointer-events-none absolute inset-0 z-[1001] flex items-center justify-center bg-black/45 transition-opacity duration-300 ${showHint ? "opacity-100" : "opacity-0"}`}
      >
        <p className="px-6 text-center text-base font-bold text-white">地図を動かすには2本指で操作してください</p>
      </div>
      <div role="group" aria-label="表示の切り替え" className="absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-lg border border-line bg-surface shadow">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => {
              setMode(m.id);
              if (missing && m.id !== "choropleth") onHideMissing?.();
            }}
            className={`px-3 py-2 text-sm font-bold transition ${mode === m.id ? "bg-accent text-on-accent" : "text-ink hover:bg-accent/10"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {map && result && mode === "heat" && <HeatLayer map={map} result={result} />}
      {map && result && mode === "choropleth" && <ChoroplethLayer map={map} result={result} missing={missing ?? undefined} />}
      {map && result && mode === "pins" && <PinLayer map={map} result={result} />}
      {map && <LocateButton map={map} />}
      {map && hqPrefecture && <HqOutline map={map} prefecture={hqPrefecture} />}
    </div>
  );
}
