import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ipaAdapter } from "../../../../src/adapters/publishers/ipa.js";
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

const INDEX_URL = "https://www.ipa.go.jp/archive/publish/index.html";
const SUBINDEX_URL = "https://www.ipa.go.jp/archive/publish/wp-security/index.html";
const ESCR_URL = "https://www.ipa.go.jp/archive/publish/secbooks20180629.html";
const MITSUMORI_URL = "https://www.ipa.go.jp/archive/publish/secbooks20050430.html";
const SEC2021_URL = "https://www.ipa.go.jp/archive/publish/wp-security/sec-2021.html";
const TN_URL = "https://www.ipa.go.jp/archive/publish/tn20191220.html";

async function makeCatalogHttp(): Promise<MockHttpClient> {
  return new MockHttpClient()
    .addResponse(INDEX_URL, { status: 200, body: await loadFixture("ipa-index.html") })
    .addResponse(SUBINDEX_URL, { status: 200, body: await loadFixture("ipa-subindex.html") })
    .addResponse(ESCR_URL, { status: 200, body: await loadFixture("ipa-detail-escr.html") })
    .addResponse(MITSUMORI_URL, { status: 200, body: await loadFixture("ipa-detail-mitsumori.html") })
    .addResponse(SEC2021_URL, { status: 200, body: await loadFixture("ipa-detail-sec2021.html") });
}

describe("ipaAdapter", () => {
  describe("search()", () => {
    it("タイトルでフィルタし、詳細ページから税込価格・ISBN13・発行日を取得する", async () => {
      const http = await makeCatalogHttp();

      const results = await ipaAdapter.search({ title: "コーディング作法ガイド" }, makeDeps(http));

      assert.strictEqual(results.length, 1);
      assert.partialDeepStrictEqual(results[0], {
        title: "SEC BOOKS：ESCR Ver. 3.0：【改訂版】組込みソフトウェア開発向け コーディング作法ガイド［C言語版］ESCR Ver.3.0",
        publisher: "IPA",
        url: ESCR_URL,
        isbn: "9784905318620",
        price: 1528,
        publishedAt: "2018-06-29",
      });
      assert.deepStrictEqual(results[0].authors, []);
      assert.strictEqual(
        results[0].coverImageUrl,
        "https://www.ipa.go.jp/archive/publish/qv6pgp00000011mh-img/000067217.png",
      );
      assert.ok(results[0].description?.startsWith("本書は"));
    });

    it("無償PDFは技術的DRMなし（free）として ebookStores に入る", async () => {
      const http = await makeCatalogHttp();

      const results = await ipaAdapter.search({ title: "コーディング作法ガイド" }, makeDeps(http));

      assert.deepStrictEqual(results[0].ebookStores, [
        { name: "IPA", url: ESCR_URL, drm: "free" },
      ]);
    });

    it("税抜表記は税込整数へ換算し、ISBN-10 は ISBN-13 へ変換する", async () => {
      const http = await makeCatalogHttp();

      const results = await ipaAdapter.search({ title: "定量的見積り" }, makeDeps(http));

      assert.strictEqual(results.length, 1);
      assert.partialDeepStrictEqual(results[0], {
        title: "SEC BOOKS：ITユーザとベンダのための定量的見積りの勧め",
        isbn: "9784274500268", // 4-274-50026-8 (ISBN-10) → ISBN-13
        price: 330,            // 本体300円（税抜）→ floor(300 * 1.1)
      });
    });

    it("サブ一覧ページ（情報セキュリティ白書）を1階層展開して書籍を拾う", async () => {
      const http = await makeCatalogHttp();

      const results = await ipaAdapter.search({ title: "情報セキュリティ白書2021" }, makeDeps(http));

      assert.strictEqual(results.length, 1);
      assert.partialDeepStrictEqual(results[0], {
        title: "情報セキュリティ白書2021",
        url: SEC2021_URL,
        isbn: "9784905318750",
        price: 2200, // 定価：2,200円（本体価格2,000 円＋税10％）
        publishedAt: "2021-07-30",
      });
    });

    it("limit を適用する", async () => {
      const http = await makeCatalogHttp();

      const results = await ipaAdapter.search({ title: "SEC BOOKS", limit: 1 }, makeDeps(http));

      assert.strictEqual(results.length, 1);
    });

    it("title 未指定なら [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await ipaAdapter.search({ author: "IPA" }, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const http = new MockHttpClient()
        .addResponse(TN_URL, { status: 200, body: await loadFixture("ipa-detail-sec2021.html") });

      const book = await ipaAdapter.getDetail(TN_URL, makeDeps(http));

      assert.strictEqual(book.publisher, "IPA");
      assert.strictEqual(book.isbn, "9784905318750");
      assert.strictEqual(book.price, 2200);
    });

    it("書誌欄（data-list）を持たない補助ページは書籍として扱わず例外を投げる", async () => {
      const http = new MockHttpClient()
        .addResponse(TN_URL, { status: 200, body: await loadFixture("ipa-detail-nonbook.html") });

      await assert.rejects(() => ipaAdapter.getDetail(TN_URL, makeDeps(http)), /書誌情報/);
    });
  });
});
