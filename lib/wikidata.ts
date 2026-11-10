// Wikidata から、チェーンの親会社（P749 親組織 / P127 所有者）を2段までたどる。取り込みスクリプト用
const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "restaurant-distribution-map/1.0";
const BATCH = 150;

export type Ancestor = { qid: string; ja?: string; en?: string };

const LABELS = (v: string) =>
  `OPTIONAL { ?${v} rdfs:label ?${v}Ja FILTER(LANG(?${v}Ja) = "ja") } OPTIONAL { ?${v} rdfs:label ?${v}En FILTER(LANG(?${v}En) = "en") }`;

export function buildAncestorsQuery(qids: string[]): string {
  const values = qids.filter((q) => /^Q\d+$/.test(q)).map((q) => `wd:${q}`).join(" ");
  return [
    "SELECT ?item ?itemJa ?itemEn ?p ?pJa ?pEn ?g ?gJa ?gEn WHERE {",
    `  VALUES ?item { ${values} }`,
    `  ${LABELS("item")}`,
    "  OPTIONAL {",
    "    ?item wdt:P749|wdt:P127 ?p .",
    `    ${LABELS("p")}`,
    "    OPTIONAL {",
    "      ?p wdt:P749|wdt:P127 ?g .",
    `      ${LABELS("g")}`,
    "    }",
    "  }",
    "}",
  ].join("\n");
}

type Binding = Record<string, { value: string } | undefined>;

const qidOf = (b: { value: string } | undefined) => b?.value.split("/").pop();

/** ID ごとに [自分, 親, その親…] を重複なしで返す */
export function parseAncestors(json: unknown): Map<string, Ancestor[]> {
  const bindings = (json as { results?: { bindings?: Binding[] } })?.results?.bindings ?? [];
  const out = new Map<string, Ancestor[]>();
  for (const b of bindings) {
    const item = qidOf(b.item);
    if (!item) continue;
    const list = out.get(item) ?? [];
    for (const v of ["item", "p", "g"]) {
      const qid = qidOf(b[v]);
      if (!qid || list.some((a) => a.qid === qid)) continue;
      const a: Ancestor = { qid };
      if (b[`${v}Ja`]) a.ja = b[`${v}Ja`]!.value;
      if (b[`${v}En`]) a.en = b[`${v}En`]!.value;
      list.push(a);
    }
    out.set(item, list);
  }
  return out;
}

/** 多くのIDを、何回かに分けて問い合わせる */
export async function fetchAncestors(qids: string[], fetchImpl: typeof fetch = fetch): Promise<Map<string, Ancestor[]>> {
  const all = new Map<string, Ancestor[]>();
  const unique = [...new Set(qids)];
  for (let i = 0; i < unique.length; i += BATCH) {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ query: buildAncestorsQuery(unique.slice(i, i + BATCH)) }).toString(),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Wikidata error: status ${res.status}`);
    for (const [k, v] of parseAncestors(await res.json())) all.set(k, v);
    if (i + BATCH < unique.length) await new Promise((r) => setTimeout(r, 1000));
  }
  return all;
}
