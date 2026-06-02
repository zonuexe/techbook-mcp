import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cqPublishingAdapter } from "../../../../src/adapters/publishers/cq-publishing.js";
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

const SEARCH_URL = "https://cc.cqpub.co.jp/lib/system/doclib_search/";
const DETAIL_URL = "https://cc.cqpub.co.jp/lib/system/doclib_item/1909/";

describe("cqPublishingAdapter", () => {
  describe("search()", () => {
    it("検索結果から書籍一覧を返す", async () => {
      const body = await loadFixture("cq-publishing-search.html");
      const http = new MockHttpClient().addResponse(SEARCH_URL, { status: 200, body });

      const results = await cqPublishingAdapter.search({ title: "C言語" }, makeDeps(http));

      assert.ok(results.length > 0);
    });

    it("タイトルから末尾の【PDF版】マーカーを除去する", async () => {
      const body = await loadFixture("cq-publishing-search.html");
      const http = new MockHttpClient().addResponse(SEARCH_URL, { status: 200, body });

      const results = await cqPublishingAdapter.search({ title: "C言語" }, makeDeps(http));

      assert.strictEqual(results[0].title, "信頼性＆再利用性を高めるC言語プログラミング");
    });

    it("価格・URL・カバー画像・出版社を返す", async () => {
      const body = await loadFixture("cq-publishing-search.html");
      const http = new MockHttpClient().addResponse(SEARCH_URL, { status: 200, body });

      const results = await cqPublishingAdapter.search({ title: "C言語" }, makeDeps(http));

      assert.partialDeepStrictEqual(results[0], {
        publisher: "CQ出版社",
        url: "https://cc.cqpub.co.jp/lib/system/doclib_item/1909/",
        price: 2860,
        coverImageUrl: "https://cc.cqpub.co.jp/lib/system-img/110/157/037/ABTQF02nA0vo.jpg",
      });
    });

    it("ebookStores が ソーシャルDRM(電子透かし) になる", async () => {
      const body = await loadFixture("cq-publishing-search.html");
      const http = new MockHttpClient().addResponse(SEARCH_URL, { status: 200, body });

      const results = await cqPublishingAdapter.search({ title: "C言語" }, makeDeps(http));

      assert.deepStrictEqual(results[0].ebookStores, [
        {
          name: "CQ出版 Tech Village",
          url: "https://cc.cqpub.co.jp/lib/system/doclib_item/1909/",
          drm: "social",
        },
      ]);
    });

    it("limit で件数を制限する", async () => {
      const body = await loadFixture("cq-publishing-search.html");
      const http = new MockHttpClient().addResponse(SEARCH_URL, { status: 200, body });

      const results = await cqPublishingAdapter.search({ title: "C言語", limit: 3 }, makeDeps(http));

      assert.strictEqual(results.length, 3);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await cqPublishingAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("cq-publishing-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await cqPublishingAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.partialDeepStrictEqual(book, {
        title: "信頼性＆再利用性を高めるC言語プログラミング",
        publisher: "CQ出版社",
        price: 2860,
        publishedAt: "2026-04-01",
        url: DETAIL_URL,
      });
    });

    it("著者一覧を返す", async () => {
      const body = await loadFixture("cq-publishing-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await cqPublishingAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.deepStrictEqual(book.authors, ["鹿取　祐二"]);
    });

    it("coverImageUrl が絶対URLになる", async () => {
      const body = await loadFixture("cq-publishing-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await cqPublishingAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.strictEqual(
        book.coverImageUrl,
        "https://cc.cqpub.co.jp/lib/system-img/201/286/037/ABTQF02nA0vo.jpg",
      );
    });

    it("ebookStores が ソーシャルDRM(電子透かし) になる", async () => {
      const body = await loadFixture("cq-publishing-detail.html");
      const http = new MockHttpClient().addResponse(DETAIL_URL, { status: 200, body });

      const book = await cqPublishingAdapter.getDetail(DETAIL_URL, makeDeps(http));

      assert.deepStrictEqual(book.ebookStores, [
        { name: "CQ出版 Tech Village", url: DETAIL_URL, drm: "social" },
      ]);
    });
  });
});
