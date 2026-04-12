import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { coronashaAdapter } from "../../../../src/adapters/publishers/coronasha.js";
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

describe("coronashaAdapter", () => {
  describe("search()", () => {
    it("電子版ありの書籍のみ返す（電子版なしは除外）", async () => {
      const body = await loadFixture("coronasha-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/result.html",
        { status: 200, body },
      );

      const results = await coronashaAdapter.search({ title: "Julia" }, makeDeps(http));

      // フィクスチャには電子版あり1件・電子版なし1件あり、電子版のみ返す
      assert.strictEqual(results.length, 1);
    });

    it("タイトルを tunogaki + book-title で組み立てる", async () => {
      const body = await loadFixture("coronasha-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/result.html",
        { status: 200, body },
      );

      const results = await coronashaAdapter.search({ title: "Julia" }, makeDeps(http));

      assert.strictEqual(results[0].title, "1から始める Juliaプログラミング大全");
    });

    it("著者一覧を返す", async () => {
      const body = await loadFixture("coronasha-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/result.html",
        { status: 200, body },
      );

      const results = await coronashaAdapter.search({ title: "Julia" }, makeDeps(http));

      assert.deepStrictEqual(results[0].authors, ["進藤 裕之", "佐藤 建太"]);
    });

    it("価格・ISBN・発行日を返す", async () => {
      const body = await loadFixture("coronasha-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/result.html",
        { status: 200, body },
      );

      const results = await coronashaAdapter.search({ title: "Julia" }, makeDeps(http));

      assert.partialDeepStrictEqual(results[0], {
        price: 3630,
        isbn: "9784339029345",
        publishedAt: "2023-05-01",
      });
    });

    it("coverImageUrl が絶対URLになる", async () => {
      const body = await loadFixture("coronasha-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/result.html",
        { status: 200, body },
      );

      const results = await coronashaAdapter.search({ title: "Julia" }, makeDeps(http));

      assert.strictEqual(
        results[0].coverImageUrl,
        "https://www.coronasha.co.jp/np/images/isbn/9784339029345_main.jpg",
      );
    });

    it("publisher が コロナ社 になる", async () => {
      const body = await loadFixture("coronasha-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/result.html",
        { status: 200, body },
      );

      const results = await coronashaAdapter.search({ title: "Julia" }, makeDeps(http));

      assert.strictEqual(results[0].publisher, "コロナ社");
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await coronashaAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("coronasha-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        { status: 200, body },
      );

      const book = await coronashaAdapter.getDetail(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "1から始める Juliaプログラミング大全",
        publisher: "コロナ社",
        price: 3630,
        publishedAt: "2023-05-01",
        isbn: "9784339029345",
      });
    });

    it("著者一覧を返す", async () => {
      const body = await loadFixture("coronasha-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        { status: 200, body },
      );

      const book = await coronashaAdapter.getDetail(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.authors, ["進藤 裕之", "佐藤 建太"]);
    });

    it("ebookStores に Kindle・Kinoppy・VarsityWave eBooks が含まれる", async () => {
      const body = await loadFixture("coronasha-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        { status: 200, body },
      );

      const book = await coronashaAdapter.getDetail(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        makeDeps(http),
      );

      for (const { name, drm } of [
        { name: "Kindle", drm: "drm" },
        { name: "Kinoppy", drm: "drm" },
        { name: "VarsityWave eBooks", drm: "drm" },
      ]) {
        assert.ok(
          book.ebookStores.some(s => s.name === name && s.drm === drm),
          `Expected store: ${name} (${drm})`,
        );
      }
    });

    it("Knowledge Worker (kw.maruzen.co.jp) は ebookStores に含まれない", async () => {
      const body = await loadFixture("coronasha-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        { status: 200, body },
      );

      const book = await coronashaAdapter.getDetail(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        makeDeps(http),
      );

      const names = book.ebookStores.map(s => s.name);
      assert.ok(!names.includes("Knowledge Worker"));
    });

    it("coverImageUrl が絶対URLになる", async () => {
      const body = await loadFixture("coronasha-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        { status: 200, body },
      );

      const book = await coronashaAdapter.getDetail(
        "https://www.coronasha.co.jp/np/isbn/9784339029345/",
        makeDeps(http),
      );

      assert.strictEqual(
        book.coverImageUrl,
        "https://www.coronasha.co.jp/np/images/isbn/9784339029345_main.jpg",
      );
    });
  });
});
