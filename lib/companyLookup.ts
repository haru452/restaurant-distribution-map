// サーバー側で使う：検索語が会社名かどうかを、生成済みの一覧（data/companies.json）で調べる
import brandsData from "@/data/brands.json";
import companiesData from "@/data/companies.json";
import { findCompany, type Company } from "./companies";
import type { Brand } from "./types";

const companies = companiesData as Company[];
const brands = brandsData as Brand[];

export function findCompanyByQuery(normalized: string): Company | null {
  return findCompany(normalized, companies, brands);
}
