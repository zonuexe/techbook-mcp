import { describe, it, expect } from "vitest";
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
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: "【PDFダウンロード版】HTML解体新書 ー仕様から紐解く本格入門",
        publisher: "ボーンデジタル",
        url: "https://wgn-obs.shop-pro.jp/?pid=167400957",
        price: 3520,
      });
      expect(results[1]).toMatchObject({
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

      expect(results[0].coverImageUrl).toBe(
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

      expect(results[0].ebookStores).toEqual([
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

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("検索リクエストに EUC-JP エンコードされた keyword が含まれる", async () => {
      const body = await loadFixture("born-digital-search.html");
      const http = new MockHttpClient().addResponse(
        "https://wgn-obs.shop-pro.jp/",
        { status: 200, body },
      );

      await bornDigitalAdapter.search({ title: "HTML" }, makeDeps(http));

      expect(http.calls[0]).toContain("mode=srh");
      // ASCII は EUC-JP でも同じバイト列だがパーセントエンコードされる
      expect(http.calls[0]).toContain("keyword=%48%54%4D%4C");
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

      expect(book).toMatchObject({
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

      expect(book.authors).toEqual(["太田 良典", "中村 直樹"]);
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

      expect(book.price).toBe(3520);
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

      expect(book.coverImageUrl).toBe(
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

      expect(book.ebookStores).toEqual([
        {
          name: "ボーンデジタル",
          url: "https://wgn-obs.shop-pro.jp/?pid=167400957",
          drm: "social",
        },
      ]);
    });
  });
});
