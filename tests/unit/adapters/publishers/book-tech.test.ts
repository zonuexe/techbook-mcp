import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { bookTechAdapter } from "../../../../src/adapters/publishers/book-tech.js";
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

describe("bookTechAdapter", () => {
  describe("search()", () => {
    it("BookRecord[] を返す", async () => {
      const body = await loadFixture("book-tech-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books",
        { status: 200, body },
      );

      const results = await bookTechAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: "次のステップへ！React実践開発　サクサク作って学ぶ UI/テスト/デプロイ",
        publisher: "インプレス NextPublishing",
        url: "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        price: 2178,
        publishedAt: "2026-02-20",
      });
    });

    it("著者名から役割語を除去する", async () => {
      const body = await loadFixture("book-tech-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books",
        { status: 200, body },
      );

      const results = await bookTechAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].authors).toEqual(["philosophy"]);
      expect(results[1].authors).toEqual(["井手 優太"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("book-tech-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books",
        { status: 200, body },
      );

      const results = await bookTechAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].coverImageUrl).toBe(
        "https://booktech-share.s3-ap-northeast-1.amazonaws.com/books/d80ffe3d.webp",
      );
    });

    it("ebookStores に BOOK TECH (social DRM) が含まれる", async () => {
      const body = await loadFixture("book-tech-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books",
        { status: 200, body },
      );

      const results = await bookTechAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].ebookStores).toEqual([
        {
          name: "BOOK TECH",
          url: "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
          drm: "social",
        },
      ]);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await bookTechAdapter.search({}, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("検索リクエストに q[...] パラメータが含まれる", async () => {
      const body = await loadFixture("book-tech-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books",
        { status: 200, body },
      );

      await bookTechAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(http.calls[0]).toContain("TypeScript");
      expect(http.calls[0]).toContain("title_or_overview");
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("book-tech-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        { status: 200, body },
      );

      const book = await bookTechAdapter.getDetail(
        "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        makeDeps(http),
      );

      expect(book).toMatchObject({
        title: "次のステップへ！React実践開発　サクサク作って学ぶ UI/テスト/デプロイ",
        publisher: "インプレス NextPublishing",
        isbn: "9784295604136",
        price: 2178,
        publishedAt: "2026-02-20",
      });
    });

    it("著者名から役割語を除去する", async () => {
      const body = await loadFixture("book-tech-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        { status: 200, body },
      );

      const book = await bookTechAdapter.getDetail(
        "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        makeDeps(http),
      );

      expect(book.authors).toEqual(["philosophy"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("book-tech-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        { status: 200, body },
      );

      const book = await bookTechAdapter.getDetail(
        "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        makeDeps(http),
      );

      expect(book.coverImageUrl).toBe(
        "https://booktech-share.s3-ap-northeast-1.amazonaws.com/books/d80ffe3d.webp",
      );
    });

    it("ebookStores に BOOK TECH (social DRM) が含まれる", async () => {
      const body = await loadFixture("book-tech-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        { status: 200, body },
      );

      const book = await bookTechAdapter.getDetail(
        "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
        makeDeps(http),
      );

      expect(book.ebookStores).toEqual([
        {
          name: "BOOK TECH",
          url: "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
          drm: "social",
        },
      ]);
    });
  });
});
