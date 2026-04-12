import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

      assert.strictEqual(results.length, 2);
      assert.partialDeepStrictEqual(results[0], {
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

      assert.deepStrictEqual(results[0].authors, ["philosophy"]);
      assert.deepStrictEqual(results[1].authors, ["井手 優太"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("book-tech-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books",
        { status: 200, body },
      );

      const results = await bookTechAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.strictEqual(
        results[0].coverImageUrl,
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

      assert.deepStrictEqual(results[0].ebookStores, [
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

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("検索リクエストに q[...] パラメータが含まれる", async () => {
      const body = await loadFixture("book-tech-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book-tech.com/books",
        { status: 200, body },
      );

      await bookTechAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.ok(http.calls[0].includes("TypeScript"));
      assert.ok(http.calls[0].includes("title_or_overview"));
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

      assert.partialDeepStrictEqual(book, {
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

      assert.deepStrictEqual(book.authors, ["philosophy"]);
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

      assert.strictEqual(
        book.coverImageUrl,
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

      assert.deepStrictEqual(book.ebookStores, [
        {
          name: "BOOK TECH",
          url: "https://book-tech.com/books/d80ffe3d-f3fe-458b-95ee-b4dd3327fab2",
          drm: "social",
        },
      ]);
    });
  });
});
