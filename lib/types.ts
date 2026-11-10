export type Shop = { name: string; lat: number; lon: number; address?: string; prefecture: string };
export type PrefectureCount = { prefecture: string; count: number };
export type SearchResult = {
  query: string;
  total: number;
  truncated: boolean;
  shops: Shop[];
  byPrefecture: PrefectureCount[];
};
export type RawShop = Omit<Shop, "prefecture">;
export type Brand = { name: string; aliases: string[]; count: number };
