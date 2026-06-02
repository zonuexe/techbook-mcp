import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pragprogAdapter } from "../../../../src/adapters/publishers/pragprog.js";
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

const INDEX_URL = "https://pragprog.com/search/index.json";
const DETAIL_URL =
  "https://pragprog.com/titles/gwpy4/practical-programming-fourth-edition-4th-edition/";

async function searchHttp(): Promise<MockHttpClient> {
  const body = await loadFixture("pragprog-search.json");
  return new MockHttpClient().addResponse(INDEX_URL, { status: 200, body });
}

describe("pragprogAdapter", () => {
  describe("search()", () => {
    it("インデックスを書名でローカルフィルタする", async () => {
      const results = await pragprogAdapter.search({ title: "Elixir" }, makeDeps(await searchHttp()));

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, "Advanced Functional Programming with Elixir");
    });

    it("errata レコードは除外する（record_type=book のみ）", async () => {
      const results = await pragprogAdapter.search({ title: "Errata" }, makeDeps(await searchHttp()));

      assert.deepStrictEqual(results, []);
    });

    it("著者名で検索できる", async () => {
      const results = await pragprogAdapter.search({ author: "Zinoviev" }, makeDeps(await searchHttp()));

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, "Practical Programming, Fourth Edition (4th edition)");
    });

    it("URL・カバー画像・出版社・DRMフリーを返す", async () => {
      const results = await pragprogAdapter.search({ title: "Practical Programming" }, makeDeps(await searchHttp()));

      assert.partialDeepStrictEqual(results[0], {
        publisher: "Pragmatic Bookshelf",
        url: DETAIL_URL,
        coverImageUrl:
          "https://pragprog.com/titles/gwpy4/practical-programming-fourth-edition-4th-edition/gwpy4-125.jpg",
      });
      assert.deepStrictEqual(results[0].ebookStores, [
        { name: "Pragmatic Bookshelf", url: DETAIL_URL, drm: "free" },
      ]);
    });

    it("limit で件数を制限する", async () => {
      const results = await pragprogAdapter.search({ title: "programming", limit: 1 }, makeDeps(await searchHttp()));

      assert.strictEqual(results.length, 1);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await pragprogAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す（ISBN・価格・発行日）", async () => {
      const body = await loadFixture("pragprog-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await pragprogAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.partialDeepStrictEqual(book, {
        title: "Practical Programming, Fourth Edition (4th edition)",
        publisher: "Pragmatic Bookshelf",
        isbn: "9798888652046",
        price: 39.95,
        currency: "USD",
        publishedAt: "2026-07-01",
        url: DETAIL_URL,
      });
    });

    it("著者を with/and/カンマで分割する", async () => {
      const body = await loadFixture("pragprog-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await pragprogAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.deepStrictEqual(book.authors, [
        "Dmitry Zinoviev",
        "Paul Gries",
        "Jennifer Campbell",
        "Jason Montojo",
      ]);
    });

    it("ebookStores が DRMフリーになる", async () => {
      const body = await loadFixture("pragprog-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await pragprogAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.deepStrictEqual(book.ebookStores, [
        { name: "Pragmatic Bookshelf", url: DETAIL_URL, drm: "free" },
      ]);
    });
  });
});
