import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { techbookfestAdapter } from "../../../../src/adapters/publishers/techbookfest.js";
import { MockHttpClient } from "../../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../../src/adapters/cache/null-cache.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../../fixtures");

const XSRF_TOKEN = "test-xsrf-token-abc123";

function makeDeps(http: MockHttpClient) {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

/** トップページ GET → XSRF-TOKEN → GraphQL POST の 2 ステップを登録する */
async function makeSearchHttp(fixtureName: string): Promise<MockHttpClient> {
  const body = await readFile(join(FIXTURES_DIR, fixtureName), "utf-8");
  return new MockHttpClient()
    .addResponse("https://techbookfest.org", {
      status: 200,
      body: "",
      headers: { "set-cookie": `XSRF-TOKEN=${encodeURIComponent(XSRF_TOKEN)}; Path=/; Secure` },
    })
    .addPostResponse("https://techbookfest.org/api/graphql", { status: 200, body });
}

describe("techbookfestAdapter", () => {
  describe("search()", () => {
    it("GraphQL レスポンスから BookRecord[] を返す", async () => {
      const http = await makeSearchHttp("techbookfest-search.json");

      const results = await techbookfestAdapter.search({ title: "TypeScript", limit: 10 }, makeDeps(http));

      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({
        title: "TypeScriptで学ぶデザインパターン",
        authors: ["サークル名A"],
        publisher: "技術書典",
        url: "https://techbookfest.org/product/01HXXXX1",
        price: 1000,
        publishedAt: "2024-01-15",
      });
      expect(results[0].coverImageUrl).toBe("https://techbookfest.org/api/image/01HXXXX1.png");
    });

    it("ebookStores に技術書典(DRMフリー)が含まれる", async () => {
      const http = await makeSearchHttp("techbookfest-search.json");

      const results = await techbookfestAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].ebookStores).toEqual([
        { name: "技術書典", url: "https://techbookfest.org/product/01HXXXX1", drm: "free" },
      ]);
    });

    it("coverImage が null の場合 coverImageUrl は undefined", async () => {
      const http = await makeSearchHttp("techbookfest-search.json");

      const results = await techbookfestAdapter.search({ title: "TypeScript" }, makeDeps(http));

      const book = results.find(b => b.url === "https://techbookfest.org/product/01HXXXX2");
      expect(book?.coverImageUrl).toBeUndefined();
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();
      const results = await techbookfestAdapter.search({}, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("トップページ GET で XSRF-TOKEN を取得してから GraphQL に POST する", async () => {
      const http = await makeSearchHttp("techbookfest-search.json");

      await techbookfestAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(http.calls[0]).toBe("https://techbookfest.org");
      expect(http.calls[1]).toBe("https://techbookfest.org/api/graphql");
    });

    it("price が 0 の書籍も返す", async () => {
      const http = await makeSearchHttp("techbookfest-search.json");

      const results = await techbookfestAdapter.search({ title: "TypeScript" }, makeDeps(http));

      const freeBook = results.find(b => b.url === "https://techbookfest.org/product/01HXXXX3");
      expect(freeBook?.price).toBe(0);
    });
  });
});
