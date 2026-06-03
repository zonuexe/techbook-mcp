import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { manateeAdapter } from "../../../../src/adapters/publishers/manatee.js";
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

describe("manateeAdapter", () => {
  describe("search()", () => {
    it("検索結果から BookRecord[] を返す", async () => {
      const body = await loadFixture("manatee-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book.mynavi.jp/manatee/books/",
        { status: 200, body },
      );

      const results = await manateeAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.strictEqual(results.length, 3);
      assert.partialDeepStrictEqual(results[0], {
        title: "現場で使えるTypeScript 詳解実践ガイド",
        publisher: "マナティ",
        url: "https://book.mynavi.jp/manatee/books/detail/id=142711",
        price: 2948,
      });
    });

    it("ebookStores にマナティ(ソーシャルDRM)が含まれる", async () => {
      const body = await loadFixture("manatee-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book.mynavi.jp/manatee/books/",
        { status: 200, body },
      );

      const results = await manateeAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.deepStrictEqual(results[0].ebookStores, [
        {
          name: "マナティ",
          url: "https://book.mynavi.jp/manatee/books/detail/id=142711",
          drm: "social",
        },
      ]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("manatee-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book.mynavi.jp/manatee/books/",
        { status: 200, body },
      );

      const results = await manateeAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.strictEqual(
        results[0].coverImageUrl,
        "https://book.mynavi.jp/files/topics/142711_ext_06_0.jpg",
      );
    });

    it("limit を適用する", async () => {
      const body = await loadFixture("manatee-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book.mynavi.jp/manatee/books/",
        { status: 200, body },
      );

      const results = await manateeAdapter.search({ title: "TypeScript", limit: 2 }, makeDeps(http));

      assert.strictEqual(results.length, 2);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await manateeAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("検索リクエストに topics_keyword が含まれる", async () => {
      const body = await loadFixture("manatee-search.html");
      const http = new MockHttpClient().addResponse(
        "https://book.mynavi.jp/manatee/books/",
        { status: 200, body },
      );

      await manateeAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.ok(http.calls[0].includes("topics_keyword=TypeScript"));
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("manatee-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://book.mynavi.jp/manatee/books/detail/id=142711",
        { status: 200, body },
      );

      const book = await manateeAdapter.getDetail(
        "https://book.mynavi.jp/manatee/books/detail/id=142711",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "現場で使えるTypeScript 詳解実践ガイド",
        publisher: "マイナビ出版",
        isbn: "9784839984274",
        price: 2948,
        publishedAt: "2024-03-22",
      });
    });

    it("Amazon 動線が無い manatee ページから EC 商品ページを辿って ASIN を取得する（Kindle優先）", async () => {
      const manateeHtml =
        '<html><body><h1 class="title">本</h1>' +
        '<a href="https://book.mynavi.jp/ec/products/detail/id=149835">紙版を見る</a>' +
        "</body></html>";
      const ecHtml =
        "<html><body>" +
        '<a href="https://www.amazon.co.jp/o/ASIN/4839980144">Amazon(紙)</a>' +
        '<a href="https://www.amazon.co.jp/dp/B0CXYZ1234">Kindle</a>' +
        "</body></html>";
      const http = new MockHttpClient()
        .addResponse("https://book.mynavi.jp/manatee/books/detail/id=149836", { status: 200, body: manateeHtml })
        .addResponse("https://book.mynavi.jp/ec/products/detail/id=149835", { status: 200, body: ecHtml });

      const book = await manateeAdapter.getDetail(
        "https://book.mynavi.jp/manatee/books/detail/id=149836",
        makeDeps(http),
      );

      assert.strictEqual(book.asin, "B0CXYZ1234");
    });

    it("著者が配列で返される", async () => {
      const body = await loadFixture("manatee-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://book.mynavi.jp/manatee/books/detail/id=142711",
        { status: 200, body },
      );

      const book = await manateeAdapter.getDetail(
        "https://book.mynavi.jp/manatee/books/detail/id=142711",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.authors, ["菅原浩之", "CodeMafia", "外村将大"]);
    });

    it("ebookStores にマナティ(ソーシャルDRM)が含まれる", async () => {
      const body = await loadFixture("manatee-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://book.mynavi.jp/manatee/books/detail/id=142711",
        { status: 200, body },
      );

      const book = await manateeAdapter.getDetail(
        "https://book.mynavi.jp/manatee/books/detail/id=142711",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.ebookStores, [
        {
          name: "マナティ",
          url: "https://book.mynavi.jp/manatee/books/detail/id=142711",
          drm: "social",
        },
      ]);
    });
  });
});
