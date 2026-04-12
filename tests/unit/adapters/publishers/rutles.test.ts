import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { rutlesAdapter } from "../../../../src/adapters/publishers/rutles.js";
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

describe("rutlesAdapter", () => {
  describe("search()", () => {
    it("【電子版】のみ BookRecord[] を返す（紙書籍は除外）", async () => {
      const body = await loadFixture("rutles-search.html");
      const http = new MockHttpClient().addResponse(
        "https://shop.rutles.net/",
        { status: 200, body },
      );

      const results = await rutlesAdapter.search({ title: "C言語" }, makeDeps(http));

      // フィクスチャには電子2件・紙1件、電子のみ返す
      assert.strictEqual(results.length, 2);
      assert.partialDeepStrictEqual(results[0], {
        title: "【電子版】C言語3Dゲームプログラミング教室",
        publisher: "ラトルズ",
        url: "https://shop.rutles.net/?pid=173173393",
        price: 3168,
      });
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("rutles-search.html");
      const http = new MockHttpClient().addResponse(
        "https://shop.rutles.net/",
        { status: 200, body },
      );

      const results = await rutlesAdapter.search({ title: "C言語" }, makeDeps(http));

      assert.strictEqual(
        results[0].coverImageUrl,
        "https://img21.shop-pro.jp/PA01496/800/product/173173393_th.jpg",
      );
    });

    it("ebookStores にラトルズ(DRMフリー)が含まれる", async () => {
      const body = await loadFixture("rutles-search.html");
      const http = new MockHttpClient().addResponse(
        "https://shop.rutles.net/",
        { status: 200, body },
      );

      const results = await rutlesAdapter.search({ title: "C言語" }, makeDeps(http));

      assert.deepStrictEqual(results[0].ebookStores, [
        {
          name: "ラトルズ",
          url: "https://shop.rutles.net/?pid=173173393",
          drm: "free",
        },
      ]);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await rutlesAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("検索URLに EUC-JP エンコードされたキーワードが含まれる", async () => {
      const body = await loadFixture("rutles-search.html");
      const http = new MockHttpClient().addResponse(
        "https://shop.rutles.net/",
        { status: 200, body },
      );

      await rutlesAdapter.search({ title: "言語" }, makeDeps(http));

      // "言語" の EUC-JP エンコード = %B8%C0%B8%EC
      assert.ok(http.calls[0].includes("%B8%C0%B8%EC"));
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("rutles-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://shop.rutles.net/?pid=173173393",
        { status: 200, body },
      );

      const book = await rutlesAdapter.getDetail(
        "https://shop.rutles.net/?pid=173173393",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "【電子版】C言語3Dゲームプログラミング教室",
        publisher: "ラトルズ",
        isbn: "9784899774211",
        price: 3168,
        publishedAt: "2014-10-25",
      });
    });

    it("著者の役割語・所属を除去する", async () => {
      const body = await loadFixture("rutles-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://shop.rutles.net/?pid=173173393",
        { status: 200, body },
      );

      const book = await rutlesAdapter.getDetail(
        "https://shop.rutles.net/?pid=173173393",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.authors, ["大槻有一郎", "山田巧"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("rutles-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://shop.rutles.net/?pid=173173393",
        { status: 200, body },
      );

      const book = await rutlesAdapter.getDetail(
        "https://shop.rutles.net/?pid=173173393",
        makeDeps(http),
      );

      assert.strictEqual(
        book.coverImageUrl,
        "https://img21.shop-pro.jp/PA01496/800/product/173173393.jpg",
      );
    });

    it("ebookStores にラトルズ(DRMフリー)が含まれる", async () => {
      const body = await loadFixture("rutles-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://shop.rutles.net/?pid=173173393",
        { status: 200, body },
      );

      const book = await rutlesAdapter.getDetail(
        "https://shop.rutles.net/?pid=173173393",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.ebookStores, [
        {
          name: "ラトルズ",
          url: "https://shop.rutles.net/?pid=173173393",
          drm: "free",
        },
      ]);
    });
  });
});
