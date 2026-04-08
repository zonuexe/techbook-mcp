import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tatsuZineAdapter } from "../../../../src/adapters/publishers/tatsu-zine.js";
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

describe("tatsuZineAdapter", () => {
  describe("search()", () => {
    it("検索結果から BookRecord[] を返す", async () => {
      const body = await loadFixture("tatsu-zine-search.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/",
        { status: 200, body },
      );

      const results = await tatsuZineAdapter.search({ title: "Go" }, makeDeps(http));

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: "Goプログラミング実践入門",
        authors: ["Sau Sheong Chang", "武舎 広幸"],
        publisher: "達人出版会",
      });
      expect(results[0].url).toBe("https://tatsu-zine.com/books/go-programming");
    });

    it("ebookStores に達人出版会(DRM-free)が含まれる", async () => {
      const body = await loadFixture("tatsu-zine-search.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/",
        { status: 200, body },
      );

      const results = await tatsuZineAdapter.search({ title: "Go" }, makeDeps(http));

      expect(results[0].ebookStores).toEqual([
        { name: "達人出版会", url: "https://tatsu-zine.com/books/go-programming", drm: "free" },
      ]);
    });

    it("limit を適用する", async () => {
      const body = await loadFixture("tatsu-zine-search.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/",
        { status: 200, body },
      );

      const results = await tatsuZineAdapter.search({ title: "Go", limit: 1 }, makeDeps(http));

      expect(results).toHaveLength(1);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();
      const results = await tatsuZineAdapter.search({}, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("検索リクエストに search パラメータが含まれる", async () => {
      const body = await loadFixture("tatsu-zine-search.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/",
        { status: 200, body },
      );

      await tatsuZineAdapter.search({ title: "Go言語" }, makeDeps(http));

      expect(http.calls[0]).toContain("search=Go%E8%A8%80%E8%AA%9E");
    });
  });

  describe("getDetail()", () => {
    it("DRM-free 書籍の詳細情報を返す", async () => {
      const body = await loadFixture("tatsu-zine-detail-free.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/go-programming",
        { status: 200, body },
      );

      const book = await tatsuZineAdapter.getDetail(
        "https://tatsu-zine.com/books/go-programming",
        makeDeps(http),
      );

      expect(book).toMatchObject({
        title: "Goプログラミング実践入門",
        authors: ["Sau Sheong Chang", "武舎 広幸"],
        publisher: "インプレス",
        price: 3520,
      });
      expect(book.ebookStores).toEqual([
        { name: "達人出版会", url: "https://tatsu-zine.com/books/go-programming", drm: "free" },
      ]);
    });

    it("ソーシャルDRM書籍は drm: 'social' になる", async () => {
      const body = await loadFixture("tatsu-zine-detail-social.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/balancing-coupling-in-software-design",
        { status: 200, body },
      );

      const book = await tatsuZineAdapter.getDetail(
        "https://tatsu-zine.com/books/balancing-coupling-in-software-design",
        makeDeps(http),
      );

      expect(book.ebookStores?.[0]).toMatchObject({
        name: "達人出版会",
        drm: "social",
      });
    });

    it("出版社が達人出版会自身の場合はフォールバックする", async () => {
      const body = `<!DOCTYPE html><html><body>
        <h1>達人出版会刊行の本</h1>
        <img src="/images/books/999/cover.jpg">
        <dl><dt>著者</dt><dd>著者名(著)</dd><dt>定価</dt><dd>2,200円 (2,000円+税)</dd></dl>
      </body></html>`;
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/some-book",
        { status: 200, body },
      );

      const book = await tatsuZineAdapter.getDetail(
        "https://tatsu-zine.com/books/some-book",
        makeDeps(http),
      );

      expect(book.publisher).toBe("達人出版会");
    });
  });
});
