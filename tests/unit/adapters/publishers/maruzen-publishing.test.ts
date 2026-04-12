import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { maruzenPublishingAdapter } from "../../../../src/adapters/publishers/maruzen-publishing.js";
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

describe("maruzenPublishingAdapter", () => {
  describe("search()", () => {
    it("BookRecord[] を返す", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      const results = await maruzenPublishingAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.ok(results.length >= 1);
      assert.partialDeepStrictEqual(results[0], {
        title: "プログラミングTypeScript",
        publisher: "丸善出版",
        url: "https://www.maruzen-publishing.co.jp/book/b10152370.html",
      });
    });

    it("著者の役割語を除去する", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      const results = await maruzenPublishingAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.deepStrictEqual(results[0].authors, ["ボリス・チェルニー", "折山文哉"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      const results = await maruzenPublishingAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.strictEqual(
        results[0].coverImageUrl,
        "https://www.maruzen-publishing.co.jp/files/isbn/978-4-621-30855-1.jpg",
      );
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await maruzenPublishingAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("検索リクエストに search_keyword が含まれる", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      await maruzenPublishingAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.ok(http.calls[0].includes("search_keyword=TypeScript"));
    });

    it("検索リクエストに format=1 が含まれる", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      await maruzenPublishingAdapter.search({ title: "TypeScript" }, makeDeps(http));

      assert.ok(http.calls[0].includes("format=1"));
    });

    it("3件取得できる", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      const results = await maruzenPublishingAdapter.search({ title: "プログラム" }, makeDeps(http));

      assert.strictEqual(results.length, 3);
    });

    it("監訳者の役割語も除去する", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      const results = await maruzenPublishingAdapter.search({ title: "統計" }, makeDeps(http));
      const statsBook = results.find(r => r.title.includes("統計"));

      assert.deepStrictEqual(statsBook?.authors, ["ピーター・ブルース", "アンドリュー・ブルース", "大橋真也"]);
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("maruzen-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/book/b10152370.html",
        { status: 200, body },
      );

      const book = await maruzenPublishingAdapter.getDetail(
        "https://www.maruzen-publishing.co.jp/book/b10152370.html",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "プログラミングTypeScript",
        publisher: "丸善出版",
        publishedAt: "2020-03-31",
      });
    });

    it("著者の役割語を除去する", async () => {
      const body = await loadFixture("maruzen-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/book/b10152370.html",
        { status: 200, body },
      );

      const book = await maruzenPublishingAdapter.getDetail(
        "https://www.maruzen-publishing.co.jp/book/b10152370.html",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.authors, ["ボリス・チェルニー", "折山文哉"]);
    });

    it("ebookStores に Kindle と Kinoppy と honto が含まれ Knowledge Worker は除外される", async () => {
      const body = await loadFixture("maruzen-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/book/b10152370.html",
        { status: 200, body },
      );

      const book = await maruzenPublishingAdapter.getDetail(
        "https://www.maruzen-publishing.co.jp/book/b10152370.html",
        makeDeps(http),
      );

      const storeNames = book.ebookStores?.map(s => s.name) ?? [];
      assert.ok(storeNames.includes("Kindle"));
      assert.ok(storeNames.includes("Kinoppy"));
      assert.ok(storeNames.includes("honto"));
      assert.ok(!storeNames.includes("Knowledge Worker"));
    });
  });
});
