import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { impressBooksAdapter } from "../../../../src/adapters/publishers/impress.js";
import { MockHttpClient } from "../../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../../src/adapters/cache/null-cache.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../../fixtures");
const DETAIL_SOCIAL_URL = "https://book.impress.co.jp/books/1125101113";
const DETAIL_EPUB_URL = "https://book.impress.co.jp/books/1124101031";

function makeDeps(http: MockHttpClient) {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), "utf-8");
}

describe("impressBooksAdapter", () => {
  describe("search()", () => {
    it("検索APIがないため常に [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();
      const results = await impressBooksAdapter.search({ title: "Python" }, makeDeps(http));
      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("クエリが空でも [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();
      const results = await impressBooksAdapter.search({}, makeDeps(http));
      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });
  });

  describe("getDetail() - ソーシャルDRM書籍", () => {
    it("タイトルを返す", async () => {
      const body = await loadFixture("impress-detail-social.html");
      const http = new MockHttpClient().addResponse(DETAIL_SOCIAL_URL, { status: 200, body });

      const book = await impressBooksAdapter.getDetail(DETAIL_SOCIAL_URL, makeDeps(http));

      assert.strictEqual(
        book.title,
        "いちばんやさしい　先生が校務に使えるGoogle NotebookLMの教本　人気講師が教える学校業務を効率化するAI活用法",
      );
    });

    it("著者名から役割語を除いて返す", async () => {
      const body = await loadFixture("impress-detail-social.html");
      const http = new MockHttpClient().addResponse(DETAIL_SOCIAL_URL, { status: 200, body });

      const book = await impressBooksAdapter.getDetail(DETAIL_SOCIAL_URL, makeDeps(http));

      assert.deepStrictEqual(book.authors, ["山本康太"]);
    });

    it("ISBN・発売日・価格を返す", async () => {
      const body = await loadFixture("impress-detail-social.html");
      const http = new MockHttpClient().addResponse(DETAIL_SOCIAL_URL, { status: 200, body });

      const book = await impressBooksAdapter.getDetail(DETAIL_SOCIAL_URL, makeDeps(http));

      assert.partialDeepStrictEqual(book, {
        isbn: "9784295023654",
        publishedAt: "2026-01-22",
        price: 1980,
      });
    });

    it("publisher が インプレスブックス になる", async () => {
      const body = await loadFixture("impress-detail-social.html");
      const http = new MockHttpClient().addResponse(DETAIL_SOCIAL_URL, { status: 200, body });

      const book = await impressBooksAdapter.getDetail(DETAIL_SOCIAL_URL, makeDeps(http));

      assert.strictEqual(book.publisher, "インプレスブックス");
    });

    it("ebookStores に インプレスブックス (social) が含まれる", async () => {
      const body = await loadFixture("impress-detail-social.html");
      const http = new MockHttpClient().addResponse(DETAIL_SOCIAL_URL, { status: 200, body });

      const book = await impressBooksAdapter.getDetail(DETAIL_SOCIAL_URL, makeDeps(http));

      assert.deepStrictEqual(book.ebookStores, [
        { name: "インプレスブックス", url: DETAIL_SOCIAL_URL, drm: "social" },
      ]);
    });

    it("coverImageUrl が https: から始まる絶対URL になる", async () => {
      const body = await loadFixture("impress-detail-social.html");
      const http = new MockHttpClient().addResponse(DETAIL_SOCIAL_URL, { status: 200, body });

      const book = await impressBooksAdapter.getDetail(DETAIL_SOCIAL_URL, makeDeps(http));

      assert.strictEqual(
        book.coverImageUrl,
        "https://img.ips.co.jp/ij/25/1125101113/1125101113-520x.jpg",
      );
    });
  });

  describe("getDetail() - EPUB書籍", () => {
    it("著者名から役割語を除いて返す", async () => {
      const body = await loadFixture("impress-detail-epub.html");
      const http = new MockHttpClient().addResponse(DETAIL_EPUB_URL, { status: 200, body });

      const book = await impressBooksAdapter.getDetail(DETAIL_EPUB_URL, makeDeps(http));

      assert.deepStrictEqual(book.authors, ["廣瀬 豪"]);
    });

    it("DRM情報が明示されない EPUB 書籍は social として返す", async () => {
      const body = await loadFixture("impress-detail-epub.html");
      const http = new MockHttpClient().addResponse(DETAIL_EPUB_URL, { status: 200, body });

      const book = await impressBooksAdapter.getDetail(DETAIL_EPUB_URL, makeDeps(http));

      assert.partialDeepStrictEqual(book.ebookStores[0], {
        name: "インプレスブックス",
        drm: "social",
      });
    });
  });
});
