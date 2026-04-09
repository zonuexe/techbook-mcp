import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { optronicsAdapter } from "../../../../src/adapters/publishers/optronics.js";
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

describe("optronicsAdapter", () => {
  describe("search()", () => {
    it("BookRecord[] を返す", async () => {
      const body = await loadFixture("optronics-search.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/list.php",
        { status: 200, body },
      );

      const results = await optronicsAdapter.search({ title: "センシング" }, makeDeps(http));

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        title: "感性計測&感覚センサ技術集成",
        url: "https://optronics-ebook.com/products/detail.php?product_id=235",
        price: 15000,
      });
    });

    it("listcomment から発行元を取得する", async () => {
      const body = await loadFixture("optronics-search.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/list.php",
        { status: 200, body },
      );

      const results = await optronicsAdapter.search({ title: "センシング" }, makeDeps(http));

      expect(results[0].publisher).toBe("センシンディー株式会社");
    });

    it("listcomment から著者を取得する", async () => {
      const body = await loadFixture("optronics-search.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/list.php",
        { status: 200, body },
      );

      const results = await optronicsAdapter.search({ title: "センシング" }, makeDeps(http));

      // 2件目は著者フィールドあり
      expect(results[1].authors).toEqual(["波多腰 玄一"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("optronics-search.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/list.php",
        { status: 200, body },
      );

      const results = await optronicsAdapter.search({ title: "センシング" }, makeDeps(http));

      expect(results[0].coverImageUrl).toBe(
        "https://optronics-ebook.com/upload/save_image/03031025_69a6388916874.jpg",
      );
    });

    it("ebookStores にオプトロニクス社 (DRMフリー) が含まれる", async () => {
      const body = await loadFixture("optronics-search.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/list.php",
        { status: 200, body },
      );

      const results = await optronicsAdapter.search({ title: "センシング" }, makeDeps(http));

      expect(results[0].ebookStores).toEqual([
        {
          name: "オプトロニクス社",
          url: "https://optronics-ebook.com/products/detail.php?product_id=235",
          drm: "free",
        },
      ]);
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await optronicsAdapter.search({}, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("検索URLに name と category_id=1 が含まれる", async () => {
      const body = await loadFixture("optronics-search.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/list.php",
        { status: 200, body },
      );

      await optronicsAdapter.search({ title: "センシング" }, makeDeps(http));

      expect(http.calls[0]).toContain("name=%E3%82%BB%E3%83%B3%E3%82%B7%E3%83%B3%E3%82%B0");
      expect(http.calls[0]).toContain("category_id=1");
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("optronics-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        { status: 200, body },
      );

      const book = await optronicsAdapter.getDetail(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        makeDeps(http),
      );

      expect(book).toMatchObject({
        title: "光センシング技術の最前線",
        price: 20000,
      });
    });

    it("main_comment から著者を取得する", async () => {
      const body = await loadFixture("optronics-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        { status: 200, body },
      );

      const book = await optronicsAdapter.getDetail(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        makeDeps(http),
      );

      expect(book.authors).toEqual(["波多腰 玄一"]);
    });

    it("main_comment から発行元を取得し ㈱ を除去する", async () => {
      const body = await loadFixture("optronics-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        { status: 200, body },
      );

      const book = await optronicsAdapter.getDetail(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        makeDeps(http),
      );

      expect(book.publisher).toBe("オプトロニクス社");
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("optronics-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        { status: 200, body },
      );

      const book = await optronicsAdapter.getDetail(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        makeDeps(http),
      );

      expect(book.coverImageUrl).toBe(
        "https://optronics-ebook.com/upload/save_image/11141121_636a1e0f7bd39.jpg",
      );
    });

    it("ebookStores にオプトロニクス社 (DRMフリー) が含まれる", async () => {
      const body = await loadFixture("optronics-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        { status: 200, body },
      );

      const book = await optronicsAdapter.getDetail(
        "https://optronics-ebook.com/products/detail.php?product_id=210",
        makeDeps(http),
      );

      expect(book.ebookStores).toEqual([
        {
          name: "オプトロニクス社",
          url: "https://optronics-ebook.com/products/detail.php?product_id=210",
          drm: "free",
        },
      ]);
    });
  });
});
