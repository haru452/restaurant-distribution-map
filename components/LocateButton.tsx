"use client";
// 地図の右下に浮かぶ「現在地へ移動」ボタン
import { useEffect, useRef, useState } from "react";
import L from "leaflet";

const ZOOM = 15;
const BLUE = "#2563eb";

export function LocateButton({ map }: { map: L.Map }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const layerRef = useRef<L.LayerGroup | null>(null);

  // 地図が作り直されたら、自分の印を外す
  useEffect(() => {
    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [map]);

  // メッセージは数秒で消す
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  function locate() {
    if (!("geolocation" in navigator)) {
      setMessage("この端末では現在地を取得できません");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(false);
        const here: L.LatLngTuple = [coords.latitude, coords.longitude];
        layerRef.current?.remove();
        layerRef.current = L.layerGroup([
          L.circle(here, { radius: coords.accuracy, color: BLUE, weight: 1, fillColor: BLUE, fillOpacity: 0.12, interactive: false }),
          L.circleMarker(here, { radius: 8, color: "#fff", weight: 3, fillColor: BLUE, fillOpacity: 1, interactive: false }),
        ]).addTo(map);
        map.flyTo(here, ZOOM, { duration: 0.8 });
      },
      (error) => {
        setBusy(false);
        setMessage(error.code === error.PERMISSION_DENIED ? "位置情報が許可されていません" : "現在地を取得できませんでした");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        aria-label="現在地へ移動"
        title="現在地へ移動"
        className="absolute bottom-12 right-3 z-[1000] flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-lg transition hover:text-accent disabled:opacity-80"
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
          className={busy ? "animate-spin" : undefined}
        >
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
      {message && (
        <p role="status" className="absolute bottom-28 right-3 z-[1000] max-w-[16rem] rounded-lg bg-ink px-3 py-2 text-sm text-surface shadow-lg">
          {message}
        </p>
      )}
    </>
  );
}
