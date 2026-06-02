import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { leanpubAdapter } from "../../../../src/adapters/publishers/leanpub.js";
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

const STORE_URL = "https://leanpub.com/store";
const DETAIL_URL = "https://leanpub.com/emacswritingstudio";

describe("leanpubAdapter", () => {
  describe("search()", () => {
    it("ストアカードから書籍一覧を返す", async () => {
      const body = await loadFixture("leanpub-search.html");
      const http = new MockHttpClient().addResponse(STORE_URL, { status: 200, body });

      const results = await leanpubAdapter.search({ title: "Emacs" }, makeDeps(http));

      assert.ok(results.length >= 5);
    });

    it("タイトル・著者・URL・カバー画像・出版社を返す", async () => {
      const body = await loadFixture("leanpub-search.html");
      const http = new MockHttpClient().addResponse(STORE_URL, { status: 200, body });

      const results = await leanpubAdapter.search({ title: "Emacs" }, makeDeps(http));
      const ews = results.find(b => b.url === "https://leanpub.com/emacswritingstudio");

      assert.ok(ews, "Emacs Writing Studio が見つからない");
      assert.strictEqual(ews.title, "Emacs Writing Studio");
      assert.deepStrictEqual(ews.authors, ["Peter Prevos"]);
      assert.strictEqual(ews.publisher, "Leanpub");
      assert.strictEqual(
        ews.coverImageUrl,
        "https://d2sofvawe08yqg.cloudfront.net/emacswritingstudio/s_featured?1728541052&1728541052",
      );
    });

    it("ebookStores が DRMフリーになる", async () => {
      const body = await loadFixture("leanpub-search.html");
      const http = new MockHttpClient().addResponse(STORE_URL, { status: 200, body });

      const results = await leanpubAdapter.search({ title: "Emacs" }, makeDeps(http));

      assert.deepStrictEqual(results[0].ebookStores, [
        { name: "Leanpub", url: results[0].url, drm: "free" },
      ]);
    });

    it("limit で件数を制限する", async () => {
      const body = await loadFixture("leanpub-search.html");
      const http = new MockHttpClient().addResponse(STORE_URL, { status: 200, body });

      const results = await leanpubAdapter.search({ title: "Emacs", limit: 2 }, makeDeps(http));

      assert.strictEqual(results.length, 2);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await leanpubAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す（価格・通貨・発行日）", async () => {
      const body = await loadFixture("leanpub-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await leanpubAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.partialDeepStrictEqual(book, {
        title: "Emacs Writing Studio",
        authors: ["Peter Prevos"],
        publisher: "Leanpub",
        price: 9.95,
        currency: "USD",
        publishedAt: "2025-06-28",
        url: DETAIL_URL,
      });
    });

    it("coverImageUrl と description を og タグから取得する", async () => {
      const body = await loadFixture("leanpub-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await leanpubAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.strictEqual(
        book.coverImageUrl,
        "https://d2sofvawe08yqg.cloudfront.net/emacswritingstudio/s_hero2x?1728541052&1728541052",
      );
      assert.ok(book.description && book.description.includes("Emacs"));
    });

    it("ebookStores が DRMフリーになる", async () => {
      const body = await loadFixture("leanpub-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await leanpubAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.deepStrictEqual(book.ebookStores, [
        { name: "Leanpub", url: DETAIL_URL, drm: "free" },
      ]);
    });
  });
});
