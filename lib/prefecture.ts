// 店の位置から都道府県を判定して数える
import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import prefectureData from "@/data/prefectures.json";
import type { PrefectureCount, RawShop, Shop } from "./types";

type PrefFeature = Feature<Polygon | MultiPolygon, { name: string }>;

export const UNKNOWN_PREFECTURE = "不明";

// 境界ボックスは読み込み時に1回だけ計算する
const prefectures = (prefectureData as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>)
  .features.map((feature: PrefFeature) => ({ feature, box: bbox(feature) }));

export function findPrefecture(lat: number, lon: number): string {
  for (const { feature, box } of prefectures) {
    const [minLon, minLat, maxLon, maxLat] = box;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    if (booleanPointInPolygon([lon, lat], feature)) return feature.properties.name;
  }
  return UNKNOWN_PREFECTURE;
}

export function assignPrefectures(shops: RawShop[]): Shop[] {
  return shops.map((shop) => ({ ...shop, prefecture: findPrefecture(shop.lat, shop.lon) }));
}

export function countByPrefecture(shops: Shop[]): PrefectureCount[] {
  const counts = new Map<string, number>();
  for (const shop of shops) counts.set(shop.prefecture, (counts.get(shop.prefecture) ?? 0) + 1);
  return [...counts]
    .map(([prefecture, count]) => ({ prefecture, count }))
    .sort((a, b) => b.count - a.count || a.prefecture.localeCompare(b.prefecture, "ja"));
}
