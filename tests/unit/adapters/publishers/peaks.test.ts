import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { peaksAdapter } from "../../../../src/adapters/publishers/peaks.js";
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

describe("peaksAdapter", () => {
  describe("search()", () => {
    it("タイトルキーワードにマッチする BookRecord[] を返す", async () => {
      const body = await loadFixture("peaks-top.html");
      const http = new MockHttpClient().addResponse(
        "https://peaks.cc",
        { status: 200, body },
      );

      const results = await peaksAdapter.search({ title: "Android" }, makeDeps(http));

      assert.strictEqual(results.length, 1);
      assert.partialDeepStrictEqual(results[0], {
        title: "チームで育てるAndroidアプリ設計",
        publisher: "PEAKS",
        url: "https://peaks.cc/books/architecture_with_team",
      });
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("peaks-top.html");
      const http = new MockHttpClient().addResponse(
        "https://peaks.cc",
        { status: 200, body },
      );

      const results = await peaksAdapter.search({ title: "Android" }, makeDeps(http));

      assert.strictEqual(
        results[0].coverImageUrl,
        "https://peaks-img.s3-ap-northeast-1.amazonaws.com/architecture_with_team_book_cover_alpha.png",
      );
    });

    it("ebookStores に PEAKS (DRMフリー) が含まれる", async () => {
      const body = await loadFixture("peaks-top.html");
      const http = new MockHttpClient().addResponse(
        "https://peaks.cc",
        { status: 200, body },
      );

      const results = await peaksAdapter.search({ title: "Android" }, makeDeps(http));

      assert.deepStrictEqual(results[0].ebookStores, [
        {
          name: "PEAKS",
          url: "https://peaks.cc/books/architecture_with_team",
          drm: "free",
        },
      ]);
    });

    it("title が空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await peaksAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("author のみの検索は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await peaksAdapter.search({ author: "伊藤" }, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("マッチしないキーワードは空配列を返す", async () => {
      const body = await loadFixture("peaks-top.html");
      const http = new MockHttpClient().addResponse(
        "https://peaks.cc",
        { status: 200, body },
      );

      const results = await peaksAdapter.search({ title: "Python" }, makeDeps(http));

      assert.deepStrictEqual(results, []);
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("peaks-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://peaks.cc/books/testing_with_jest",
        { status: 200, body },
      );

      const book = await peaksAdapter.getDetail(
        "https://peaks.cc/books/testing_with_jest",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "Jestではじめるテスト入門",
        publisher: "PEAKS",
        price: 2900,
      });
    });

    it("複数著者を取得し末尾カンマを除去する", async () => {
      const body = await loadFixture("peaks-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://peaks.cc/books/testing_with_jest",
        { status: 200, body },
      );

      const book = await peaksAdapter.getDetail(
        "https://peaks.cc/books/testing_with_jest",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.authors, ["伊藤 貴之", "椎葉 光行"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("peaks-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://peaks.cc/books/testing_with_jest",
        { status: 200, body },
      );

      const book = await peaksAdapter.getDetail(
        "https://peaks.cc/books/testing_with_jest",
        makeDeps(http),
      );

      assert.strictEqual(
        book.coverImageUrl,
        "https://peaks-img.s3-ap-northeast-1.amazonaws.com/testing_with_jest_twittercard.png",
      );
    });

    it("ebookStores に PEAKS (DRMフリー) が含まれる", async () => {
      const body = await loadFixture("peaks-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://peaks.cc/books/testing_with_jest",
        { status: 200, body },
      );

      const book = await peaksAdapter.getDetail(
        "https://peaks.cc/books/testing_with_jest",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.ebookStores, [
        {
          name: "PEAKS",
          url: "https://peaks.cc/books/testing_with_jest",
          drm: "free",
        },
      ]);
    });
  });
});
