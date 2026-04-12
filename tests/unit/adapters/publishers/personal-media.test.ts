import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { personalMediaAdapter } from "../../../../src/adapters/publishers/personal-media.js";
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

describe("personalMediaAdapter", () => {
  describe("search()", () => {
    it("タイトルキーワードに一致する書籍のみ返す", async () => {
      const body = await loadFixture("personal-media-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/webshop/book/",
        { status: 200, body },
      );

      const results = await personalMediaAdapter.search({ title: "TRON" }, makeDeps(http));

      // フィクスチャには TRON 含む2件・含まない1件あり
      assert.strictEqual(results.length, 2);
    });

    it("書籍タイトルが正しく取得される", async () => {
      const body = await loadFixture("personal-media-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/webshop/book/",
        { status: 200, body },
      );

      const results = await personalMediaAdapter.search({ title: "TRON" }, makeDeps(http));

      assert.strictEqual(results[0].title, "μITRON4.0標準ガイドブック(PDF版)");
    });

    it("税込価格が取得される", async () => {
      const body = await loadFixture("personal-media-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/webshop/book/",
        { status: 200, body },
      );

      const results = await personalMediaAdapter.search({ title: "TRON" }, makeDeps(http));

      assert.strictEqual(results[0].price, 2585);
    });

    it("url が書籍詳細ページの絶対URLになる", async () => {
      const body = await loadFixture("personal-media-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/webshop/book/",
        { status: 200, body },
      );

      const results = await personalMediaAdapter.search({ title: "TRON" }, makeDeps(http));

      assert.strictEqual(
        results[0].url,
        "https://www.personal-media.co.jp/book/tron/191.html",
      );
    });

    it("publisher が パーソナルメディア になる", async () => {
      const body = await loadFixture("personal-media-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/webshop/book/",
        { status: 200, body },
      );

      const results = await personalMediaAdapter.search({ title: "TRON" }, makeDeps(http));

      assert.strictEqual(results[0].publisher, "パーソナルメディア");
    });

    it("title が空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await personalMediaAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("author のみ指定の場合も [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await personalMediaAdapter.search({ author: "坂村健" }, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });
  });

  describe("getDetail()", () => {
    it("タイトルを返す", async () => {
      const body = await loadFixture("personal-media-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/book/tron/191.html",
        { status: 200, body },
      );

      const book = await personalMediaAdapter.getDetail(
        "https://www.personal-media.co.jp/book/tron/191.html",
        makeDeps(http),
      );

      assert.strictEqual(book.title, "μITRON4.0標準ガイドブック");
    });

    it("著者名から役割語を除去して返す", async () => {
      const body = await loadFixture("personal-media-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/book/tron/191.html",
        { status: 200, body },
      );

      const book = await personalMediaAdapter.getDetail(
        "https://www.personal-media.co.jp/book/tron/191.html",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.authors, ["坂村　健", "社団法人トロン協会"]);
    });

    it("価格・ISBN・発行日を返す", async () => {
      const body = await loadFixture("personal-media-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/book/tron/191.html",
        { status: 200, body },
      );

      const book = await personalMediaAdapter.getDetail(
        "https://www.personal-media.co.jp/book/tron/191.html",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        price: 3520,
        isbn: "9784893621917",
        publishedAt: "2001-11-01",
      });
    });

    it("coverImageUrl が絶対URLになる", async () => {
      const body = await loadFixture("personal-media-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/book/tron/191.html",
        { status: 200, body },
      );

      const book = await personalMediaAdapter.getDetail(
        "https://www.personal-media.co.jp/book/tron/191.html",
        makeDeps(http),
      );

      assert.strictEqual(
        book.coverImageUrl,
        "https://www.personal-media.co.jp/book/tron/images/191_l.jpg",
      );
    });

    it("ebookStores に PDF版（social）と Smooth Reader版（drm）が含まれる", async () => {
      const body = await loadFixture("personal-media-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.personal-media.co.jp/book/tron/191.html",
        { status: 200, body },
      );

      const book = await personalMediaAdapter.getDetail(
        "https://www.personal-media.co.jp/book/tron/191.html",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.ebookStores, [
        {
          name: "パーソナルメディア",
          url: "https://www.personal-media.co.jp/webshop/book/20191.html",
          drm: "social",
        },
        {
          name: "Smooth Reader",
          url: "https://www.personal-media.co.jp/smoothreader/store/tron/191.html",
          drm: "drm",
        },
      ]);
    });
  });
});
