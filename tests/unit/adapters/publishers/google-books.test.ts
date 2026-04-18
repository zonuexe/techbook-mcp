import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { makeGoogleBooksAdapter } from "../../../../src/adapters/publishers/google-books.js";
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

const TEST_API_KEY = "test-api-key";
const adapter = makeGoogleBooksAdapter(TEST_API_KEY);
const API_BASE = "https://www.googleapis.com/books/v1";

describe("googleBooksAdapter", () => {
  describe("search()", () => {
    it("APIキー未設定の場合は [] を返しHTTPを呼ばない", async () => {
      const noKeyAdapter = makeGoogleBooksAdapter("");
      const http = new MockHttpClient();

      const results = await noKeyAdapter.search({ title: "Deep Learning" }, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await adapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("BookRecord[] を返す", async () => {
      const body = await loadFixture("google-books-search.json");
      const http = new MockHttpClient().addResponse(API_BASE, { status: 200, body });

      const results = await adapter.search({ title: "ゼロから作るDeep Learning" }, makeDeps(http));

      assert.strictEqual(results.length, 2);
      assert.partialDeepStrictEqual(results[0], {
        title: "ゼロから作るDeep Learning",
        authors: ["斎藤康毅"],
        publisher: "オライリー・ジャパン",
        isbn: "9784873117584",
        price: 3520,
        publishedAt: "2016-09-24",
      });
    });

    it("リクエストURLにクエリとAPIキーが含まれる", async () => {
      const body = await loadFixture("google-books-search.json");
      const http = new MockHttpClient().addResponse(API_BASE, { status: 200, body });

      await adapter.search({ title: "Deep Learning" }, makeDeps(http));

      assert.ok(http.calls[0].includes("q=Deep+Learning") || http.calls[0].includes("q=Deep%20Learning"));
      assert.ok(http.calls[0].includes(`key=${TEST_API_KEY}`));
      assert.ok(http.calls[0].includes("langRestrict=ja"));
    });

    it("coverImageUrl が HTTPS になる", async () => {
      const body = await loadFixture("google-books-search.json");
      const http = new MockHttpClient().addResponse(API_BASE, { status: 200, body });

      const results = await adapter.search({ title: "ゼロから作るDeep Learning" }, makeDeps(http));

      assert.ok(results[0].coverImageUrl?.startsWith("https://"));
    });

    it("publishedDate が年月のみの場合は末日を 01 で補完する", async () => {
      const body = await loadFixture("google-books-search.json");
      const http = new MockHttpClient().addResponse(API_BASE, { status: 200, body });

      const results = await adapter.search({ title: "ゼロから作るDeep Learning" }, makeDeps(http));

      assert.strictEqual(results[1].publishedAt, "2018-07-01");
    });

    it("totalItems が 0 のとき空配列を返す", async () => {
      const body = JSON.stringify({ totalItems: 0 });
      const http = new MockHttpClient().addResponse(API_BASE, { status: 200, body });

      const results = await adapter.search({ title: "存在しない書籍" }, makeDeps(http));

      assert.deepStrictEqual(results, []);
    });
  });

  describe("getDetail()", () => {
    it("URLからボリュームIDを抽出して詳細情報を返す", async () => {
      const body = await loadFixture("google-books-detail.json");
      const http = new MockHttpClient().addResponse(
        `${API_BASE}/volumes/abc123XYZ`,
        { status: 200, body },
      );

      const book = await adapter.getDetail(
        "https://books.google.co.jp/books?id=abc123XYZ",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "ゼロから作るDeep Learning",
        authors: ["斎藤康毅"],
        publisher: "オライリー・ジャパン",
        isbn: "9784873117584",
        price: 3520,
      });
    });

    it("リクエストURLにAPIキーが含まれる", async () => {
      const body = await loadFixture("google-books-detail.json");
      const http = new MockHttpClient().addResponse(
        `${API_BASE}/volumes/abc123XYZ`,
        { status: 200, body },
      );

      await adapter.getDetail("https://books.google.co.jp/books?id=abc123XYZ", makeDeps(http));

      assert.ok(http.calls[0].includes(`key=${TEST_API_KEY}`));
    });

    it("無効なURLの場合はエラーを投げる", async () => {
      const http = new MockHttpClient();

      await assert.rejects(
        () => adapter.getDetail("https://books.google.com/", makeDeps(http)),
        /URLからボリュームIDを取得できません/,
      );
    });

    it("APIキー未設定の場合はエラーを投げる", async () => {
      const noKeyAdapter = makeGoogleBooksAdapter("");
      const http = new MockHttpClient();

      await assert.rejects(
        () => noKeyAdapter.getDetail("https://books.google.com/books?id=abc123XYZ", makeDeps(http)),
        /GOOGLE_BOOKS_API_KEY/,
      );
    });
  });
});
