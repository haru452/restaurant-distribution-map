"use client";
// ピン表示。近い店は数字の丸にまとめる
import { useEffect } from "react";
import L from "leaflet";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { SearchResult } from "@/lib/types";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function PinLayer({ map, result }: { map: L.Map; result: SearchResult }) {
  useEffect(() => {
    let group: L.MarkerClusterGroup | null = null;
    let cancelled = false;
    // leaflet.markercluster はグローバルの L を使う
    (window as unknown as { L: typeof L }).L = L;
    void import("leaflet.markercluster").then(() => {
      if (cancelled) return;
      const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d9482b";
      group = L.markerClusterGroup({ showCoverageOnHover: false, chunkedLoading: true });
      for (const shop of result.shops) {
        const marker = L.circleMarker([shop.lat, shop.lon], {
          radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.95,
        });
        const address = shop.address ? `<br><span style="color:#6b665f">${escapeHtml(shop.address)}</span>` : "";
        marker.bindPopup(`<strong>${escapeHtml(shop.name)}</strong>${address}`);
        group.addLayer(marker as unknown as L.Marker);
      }
      group.addTo(map);
    });
    return () => {
      cancelled = true;
      group?.remove();
    };
  }, [map, result]);
  return null;
}
