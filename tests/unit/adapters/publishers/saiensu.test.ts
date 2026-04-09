import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { saiensuAdapter } from "../../../../src/adapters/publishers/saiensu.js";
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

describe("saiensuAdapter", () => {
  describe("search()", () => {
    it("電子書籍のみ BookRecord[] を返す（紙は除外）", async () => {
      const body = await loadFixture("saiensu-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.saiensu.co.jp/search/",
        { status: 200, body },
      );

      const results = await saiensuAdapter.search({ title: "統計" }, makeDeps(http));

      // フィクスチャには電子1件・紙1件あり、電子のみ返す
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        title: "統計リテラシーI【電子版】 ―記述統計から推測統計へ",
        authors: ["堀井俊佑"],
        publisher: "サイエンス社",
        url: "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
        isbn: "9784781990491",
        price: 2695,
        publishedAt: "2026-03-25",
      });
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("saiensu-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.saiensu.co.jp/search/",
        { status: 200, body },
      );

      const results = await saiensuAdapter.search({ title: "統計" }, makeDeps(http));

      expect(results[0].coverImageUrl).toBe(
        "https://www.saiensu.co.jp/bookThumbs/2026-978-4-7819-9049-1.jpg",
      );
    });

    it("ebookStores にサイエンス社(DRM付き)が含まれる", async () => {
      const body = await loadFixture("saiensu-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.saiensu.co.jp/search/",
        { status: 200, body },
      );

      const results = await saiensuAdapter.search({ title: "統計" }, makeDeps(http));

      expect(results[0].ebookStores).toEqual([
        {
          name: "サイエンス社",
          url: "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
          drm: "password_pdf",
        },
      ]);
    });

    it("著者の所属・役割語を除去する", async () => {
      const body = await loadFixture("saiensu-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.saiensu.co.jp/search/",
        { status: 200, body },
      );

      const results = await saiensuAdapter.search({ title: "統計" }, makeDeps(http));

      expect(results[0].authors).toEqual(["堀井俊佑"]);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await saiensuAdapter.search({}, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("検索リクエストに keyword が含まれる", async () => {
      const body = await loadFixture("saiensu-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.saiensu.co.jp/search/",
        { status: 200, body },
      );

      await saiensuAdapter.search({ title: "意味論" }, makeDeps(http));

      expect(http.calls[0]).toContain("keyword=%E6%84%8F%E5%91%B3%E8%AB%96");
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("saiensu-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
        { status: 200, body },
      );

      const book = await saiensuAdapter.getDetail(
        "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
        makeDeps(http),
      );

      expect(book).toMatchObject({
        title: "統計リテラシーI【電子版】 ―記述統計から推測統計へ",
        publisher: "サイエンス社",
        isbn: "9784781990491",
        price: 2695,
        publishedAt: "2026-03-25",
      });
    });

    it("著者の所属・役割語を除去する", async () => {
      const body = await loadFixture("saiensu-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
        { status: 200, body },
      );

      const book = await saiensuAdapter.getDetail(
        "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
        makeDeps(http),
      );

      expect(book.authors).toEqual(["堀井俊佑"]);
    });

    it("ebookStores にサイエンス社(DRM付き)が含まれる", async () => {
      const body = await loadFixture("saiensu-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
        { status: 200, body },
      );

      const book = await saiensuAdapter.getDetail(
        "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
        makeDeps(http),
      );

      expect(book.ebookStores).toEqual([
        {
          name: "サイエンス社",
          url: "https://www.saiensu.co.jp/search/?isbn=978-4-7819-9049-1&y=2026",
          drm: "password_pdf",
        },
      ]);
    });
  });
});
