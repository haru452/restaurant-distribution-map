export type Shop = { name: string; lat: number; lon: number; address?: string; prefecture: string };
export type PrefectureCount = { prefecture: string; count: number };
export type SearchResult = {
  query: string;
  total: number;
  truncated: boolean;
  source: "db" | "live";
  shops: Shop[];
  byPrefecture: PrefectureCount[];
  /** 会社名で検索したとき：会社名とチェーンごとの店数 */
  company?: { name: string; brands: { name: string; count: number }[] };
};
export type RawShop = Omit<Shop, "prefecture">;
/** Overpass から取った店（保存用の情報つき） */
export type OsmShop = RawShop & { osmId: string; brand?: string; brandWikidata?: string; searchKey: string };
/** 候補に出す名前。会社のときは note にチェーン名を入れる */
export type Brand = { name: string; aliases: string[]; count: number; note?: string };
