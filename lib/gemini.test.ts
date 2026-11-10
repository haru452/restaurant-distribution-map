import { describe, expect, it } from "vitest";
import { extractSources } from "./gemini";

describe("extractSources", () => {
  it("Google 検索の参考ページを重複なしで取り出す", () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://a.example", title: "A社" } },
              { web: { uri: "https://a.example", title: "A社" } },
              { web: { uri: "https://b.example" } },
              {},
            ],
          },
        },
      ],
    };
    expect(extractSources(response)).toEqual([
      { title: "A社", uri: "https://a.example" },
      { title: "https://b.example", uri: "https://b.example" },
    ]);
  });
  it("参考ページがなければ空", () => {
    expect(extractSources({})).toEqual([]);
  });
});
