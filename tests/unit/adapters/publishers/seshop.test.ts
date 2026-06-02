import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
      assert.strictEqual(results.length, 2);
      assert.partialDeepStrictEqual(results[0], {
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

      assert.strictEqual(
        results[0].coverImageUrl,
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

      assert.deepStrictEqual(results[0].ebookStores, [
        {
          name: "SEshop",
          url: "https://www.seshop.com/product/detail/26500",
          drm: "social",
        },
      ]);
    });

    it("詳細ページから著者と ISBN を補完する", async () => {
      const searchBody = await loadFixture("seshop-search.html");
      const detailBody = await loadFixture("seshop-detail.html");
      const http = new MockHttpClient()
        .addResponse("https://www.seshop.com/search", { status: 200, body: searchBody })
        .addResponse("https://www.seshop.com/product/detail/", { status: 200, body: detailBody });

      const results = await seshopAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.strictEqual(results.length, 2);
      assert.deepStrictEqual(results[0].authors, ["山田 太郎", "鈴木 花子"]);
      assert.strictEqual(results[0].isbn, "9784798190014");
    });

    it("詳細取得が失敗しても基本情報は返す（著者・ISBN は欠落）", async () => {
      const searchBody = await loadFixture("seshop-search.html");
      // 詳細URLは未登録 → 取得失敗。基本情報のみで返ること
      const http = new MockHttpClient()
        .addResponse("https://www.seshop.com/search", { status: 200, body: searchBody });

      const results = await seshopAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.strictEqual(results.length, 2);
      assert.deepStrictEqual(results[0].authors, []);
      assert.strictEqual(results[0].isbn, undefined);
      assert.strictEqual(results[0].title, "TypeScript入門【PDF版】");
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await seshopAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("検索リクエストに keyword と category_id=327 が含まれる", async () => {
      const body = await loadFixture("seshop-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/search",
        { status: 200, body },
      );

      await seshopAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.ok(http.calls[0].includes("keyword=TypeScript"));
      assert.ok(http.calls[0].includes("category_id=327"));
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

      assert.partialDeepStrictEqual(book, {
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

      assert.deepStrictEqual(book.authors, ["山田 太郎", "鈴木 花子"]);
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

      assert.strictEqual(
        book.coverImageUrl,
        "https://www.seshop.com/static/images/product/26500/L.png",
      );
    });

    it("meta description から定型接頭辞を除いた紹介文を取得する", async () => {
      const body = await loadFixture("seshop-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.seshop.com/product/detail/26500",
        { status: 200, body },
      );

      const book = await seshopAdapter.getDetail(
        "https://www.seshop.com/product/detail/26500",
        makeDeps(http),
      );

      assert.strictEqual(
        book.description,
        "TypeScriptの基礎から実践までを解説する入門書です。",
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

      assert.deepStrictEqual(book.ebookStores, [
        {
          name: "SEshop",
          url: "https://www.seshop.com/product/detail/26500",
          drm: "social",
        },
      ]);
    });
  });
});
