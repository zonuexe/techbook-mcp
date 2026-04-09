import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { oreillyJapanAdapter } from "../../../../src/adapters/publishers/oreilly-japan.js";
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

describe("oreillyJapanAdapter", () => {
  describe("search()", () => {
    it("タイトルでフィルタリングして BookRecord[] を返す", async () => {
      const body = await loadFixture("oreilly-ebook-list.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/ebook/",
        { status: 200, body },
      );

      const results = await oreillyJapanAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        title: "Effective TypeScript 第2版",
        publisher: "オライリー・ジャパン",
        url: "https://www.oreilly.co.jp/books/9784814401093/",
        isbn: "9784814401093",
        price: 4620,
        publishedAt: "2025-04-08",
      });
    });

    it("ebookStores にオライリー・ジャパン(DRMフリー)が含まれる", async () => {
      const body = await loadFixture("oreilly-ebook-list.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/ebook/",
        { status: 200, body },
      );

      const results = await oreillyJapanAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].ebookStores).toEqual([
        {
          name: "オライリー・ジャパン",
          url: "https://www.oreilly.co.jp/books/9784814401093/",
          drm: "free",
        },
      ]);
    });

    it("coverImageUrl が ISBN から構築される", async () => {
      const body = await loadFixture("oreilly-ebook-list.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/ebook/",
        { status: 200, body },
      );

      const results = await oreillyJapanAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].coverImageUrl).toBe(
        "https://www.oreilly.co.jp/books/images/picture_large978-4-8144-0109-3.jpeg",
      );
    });

    it("大文字小文字を区別せずにフィルタリングする", async () => {
      const body = await loadFixture("oreilly-ebook-list.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/ebook/",
        { status: 200, body },
      );

      const results = await oreillyJapanAdapter.search({ title: "typescript" }, makeDeps(http));

      expect(results).toHaveLength(1);
    });

    it("limit を適用する", async () => {
      const body = await loadFixture("oreilly-ebook-list.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/ebook/",
        { status: 200, body },
      );

      const results = await oreillyJapanAdapter.search({ title: "の", limit: 1 }, makeDeps(http));

      expect(results).toHaveLength(1);
    });

    it("title が未指定の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await oreillyJapanAdapter.search({}, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("author のみの場合も [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await oreillyJapanAdapter.search({ author: "Dan Vanderkam" }, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("oreilly-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/books/9784814401093/",
        { status: 200, body },
      );

      const book = await oreillyJapanAdapter.getDetail(
        "https://www.oreilly.co.jp/books/9784814401093/",
        makeDeps(http),
      );

      expect(book).toMatchObject({
        isbn: "9784814401093",
        price: 4620,
        publishedAt: "2025-04-08",
        publisher: "オライリー・ジャパン",
      });
      expect(book.title).toContain("Effective TypeScript 第2版");
    });

    it("著者が配列で返される（役割語を除去）", async () => {
      const body = await loadFixture("oreilly-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/books/9784814401093/",
        { status: 200, body },
      );

      const book = await oreillyJapanAdapter.getDetail(
        "https://www.oreilly.co.jp/books/9784814401093/",
        makeDeps(http),
      );

      expect(book.authors).toEqual(["Dan Vanderkam", "今村 謙士"]);
    });

    it("coverImageUrl が取得される", async () => {
      const body = await loadFixture("oreilly-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/books/9784814401093/",
        { status: 200, body },
      );

      const book = await oreillyJapanAdapter.getDetail(
        "https://www.oreilly.co.jp/books/9784814401093/",
        makeDeps(http),
      );

      expect(book.coverImageUrl).toBe(
        "https://www.oreilly.co.jp/books/images/picture_large978-4-8144-0109-3.jpeg",
      );
    });

    it("ebookStores にオライリー・ジャパン(DRMフリー)が含まれる", async () => {
      const body = await loadFixture("oreilly-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.oreilly.co.jp/books/9784814401093/",
        { status: 200, body },
      );

      const book = await oreillyJapanAdapter.getDetail(
        "https://www.oreilly.co.jp/books/9784814401093/",
        makeDeps(http),
      );

      expect(book.ebookStores).toEqual([
        {
          name: "オライリー・ジャパン",
          url: "https://www.oreilly.co.jp/books/9784814401093/",
          drm: "free",
        },
      ]);
    });
  });
});
