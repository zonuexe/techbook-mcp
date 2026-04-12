import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { bornDigitalAdapter } from "../../../../src/adapters/publishers/born-digital.js";
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

describe("bornDigitalAdapter", () => {
  describe("search()", () => {
    it("電子書籍のみ BookRecord[] を返す（紙書籍は除外）", async () => {
      const body = await loadFixture("born-digital-search.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/",
        { status: 200, body },
      );

      const results = await bornDigitalAdapter.search({ title: "HTML" }, makeDeps(http));

      // フィクスチャには電子2件・紙1件あり、電子のみ返す
      assert.strictEqual(results.length, 2);
      assert.partialDeepStrictEqual(results[0], {
        title: "【PDFダウンロード版】HTML解体新書 ー仕様から紐解く本格入門",
        publisher: "ボーンデジタル",
        url: "https://wgn-obs.shop-pro.jp/?pid=167400957",
        price: 3520,
      });
      assert.partialDeepStrictEqual(results[1], {
        title: "【電子書籍版】インクルーシブHTML+CSS & JavaScript",
        publisher: "ボーンデジタル",
        url: "https://wgn-obs.shop-pro.jp/?pid=144269584",
        price: 2640,
      });
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("born-digital-search.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/",
        { status: 200, body },
      );

      const results = await bornDigitalAdapter.search({ title: "HTML" }, makeDeps(http));

      assert.strictEqual(
        results[0].coverImageUrl,
        "https://img07.shop-pro.jp/PA01427/945/product/167400957_th.png?cmsp_timestamp=20220328140327",
      );
    });

    it("ebookStores に ボーンデジタル (social DRM) が含まれる", async () => {
      const body = await loadFixture("born-digital-search.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/",
        { status: 200, body },
      );

      const results = await bornDigitalAdapter.search({ title: "HTML" }, makeDeps(http));

      assert.deepStrictEqual(results[0].ebookStores, [
        {
          name: "ボーンデジタル",
          url: "https://wgn-obs.shop-pro.jp/?pid=167400957",
          drm: "social",
        },
      ]);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await bornDigitalAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("検索リクエストに EUC-JP エンコードされた keyword が含まれる", async () => {
      const body = await loadFixture("born-digital-search.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/",
        { status: 200, body },
      );

      await bornDigitalAdapter.search({ title: "HTML" }, makeDeps(http));

      assert.ok(http.calls[0].includes("mode=srh"));
      // ASCII は EUC-JP でも同じバイト列だがパーセントエンコードされる
      assert.ok(http.calls[0].includes("keyword=%48%54%4D%4C"));
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("born-digital-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        { status: 200, body },
      );

      const book = await bornDigitalAdapter.getDetail(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "【PDFダウンロード版】HTML解体新書 ー仕様から紐解く本格入門",
        publisher: "ボーンデジタル",
        price: 3520,
        publishedAt: "2022-04-07",
      });
    });

    it("著者を取得する", async () => {
      const body = await loadFixture("born-digital-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        { status: 200, body },
      );

      const book = await bornDigitalAdapter.getDetail(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.authors, ["太田 良典", "中村 直樹"]);
    });

    it("Colorme JSON から価格を取得する", async () => {
      const body = await loadFixture("born-digital-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        { status: 200, body },
      );

      const book = await bornDigitalAdapter.getDetail(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        makeDeps(http),
      );

      assert.strictEqual(book.price, 3520);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("born-digital-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        { status: 200, body },
      );

      const book = await bornDigitalAdapter.getDetail(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        makeDeps(http),
      );

      assert.strictEqual(
        book.coverImageUrl,
        "https://img07.shop-pro.jp/PA01427/945/product/167400957.png?cmsp_timestamp=20220328140327",
      );
    });

    it("ebookStores に ボーンデジタル (social DRM) が含まれる", async () => {
      const body = await loadFixture("born-digital-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        { status: 200, body },
      );

      const book = await bornDigitalAdapter.getDetail(
        "https://wgn-obs.shop-pro.jp/?pid=167400957",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.ebookStores, [
        {
          name: "ボーンデジタル",
          url: "https://wgn-obs.shop-pro.jp/?pid=167400957",
          drm: "social",
        },
      ]);
    });
  });
});
