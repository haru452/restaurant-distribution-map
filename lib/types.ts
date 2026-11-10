export type Shop = { name: string; lat: number; lon: number; address?: string; prefecture: string };
export type PrefectureCount = { prefecture: string; count: number };
export type SearchResult = {
  query: string;
  total: number;
  truncated: boolean;
  source: "db" | "live";
  shops: Shop[];
  byPrefecture: PrefectureCount[];
};
export type RawShop = Omit<Shop, "prefecture">;
/** Overpass から取った店（保存用の情報つき） */
export type OsmShop = RawShop & { osmId: string; brand?: string; brandWikidata?: string; searchKey: string };
export type Brand = { name: string; aliases: string[]; count: number };
