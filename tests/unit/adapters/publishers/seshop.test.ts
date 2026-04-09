import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { seshopAdapter } from "../../../../src/adapters/publishers/seshop.js";
import { MockHttpClient } from "../../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../../src/adapters/cache/null-cache.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../../fixtures");

function makeDeps(http: MockHttpClient) {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), "utf-8");
}

describe("seshopAdapter", () => {
  describe("search()", () => {
    it("電子書籍のみ BookRecord[] を返す（紙書籍は除外）", async () => {
      const body = await loadFixture("seshop-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/search",
        { status: 200, body },
      );

      const results = await seshopAdapter.search({ title: "TypeScript" }, makeDeps(http));

      // フィクスチャには電子2件・紙1件あり、電子のみ返す
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: "TypeScript入門【PDF版】",
        publisher: "翔泳社",
        url: "https://www.seshop.com/product/detail/26500",
        price: 3520,
        publishedAt: "2024-06-10",
      });
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("seshop-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/search",
        { status: 200, body },
      );

      const results = await seshopAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].coverImageUrl).toBe(
        "https://www.seshop.com/static/images/product/26500/L.png",
      );
    });

    it("ebookStores に SEshop (social DRM) が含まれる", async () => {
      const body = await loadFixture("seshop-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/search",
        { status: 200, body },
      );

      const results = await seshopAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].ebookStores).toEqual([
        {
          name: "SEshop",
          url: "https://www.seshop.com/product/detail/26500",
          drm: "social",
        },
      ]);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await seshopAdapter.search({}, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("検索リクエストに keyword と category_id=327 が含まれる", async () => {
      const body = await loadFixture("seshop-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/search",
        { status: 200, body },
      );

      await seshopAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(http.calls[0]).toContain("keyword=TypeScript");
      expect(http.calls[0]).toContain("category_id=327");
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("seshop-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/product/detail/26500",
        { status: 200, body },
      );

      const book = await seshopAdapter.getDetail(
        "https://www.seshop.com/product/detail/26500",
        makeDeps(http),
      );

      expect(book).toMatchObject({
        title: "TypeScript入門【PDF版】",
        publisher: "翔泳社",
        isbn: "9784798190014",
        price: 3520,
        publishedAt: "2024-06-10",
      });
    });

    it("複数著者を取得する", async () => {
      const body = await loadFixture("seshop-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/product/detail/26500",
        { status: 200, body },
      );

      const book = await seshopAdapter.getDetail(
        "https://www.seshop.com/product/detail/26500",
        makeDeps(http),
      );

      expect(book.authors).toEqual(["山田 太郎", "鈴木 花子"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("seshop-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/product/detail/26500",
        { status: 200, body },
      );

      const book = await seshopAdapter.getDetail(
        "https://www.seshop.com/product/detail/26500",
        makeDeps(http),
      );

      expect(book.coverImageUrl).toBe(
        "https://www.seshop.com/static/images/product/26500/L.png",
      );
    });

    it("ebookStores に SEshop (social DRM) が含まれる", async () => {
      const body = await loadFixture("seshop-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/product/detail/26500",
        { status: 200, body },
      );

      const book = await seshopAdapter.getDetail(
        "https://www.seshop.com/product/detail/26500",
        makeDeps(http),
      );

      expect(book.ebookStores).toEqual([
        {
          name: "SEshop",
          url: "https://www.seshop.com/product/detail/26500",
          drm: "social",
        },
      ]);
    });
  });
});
