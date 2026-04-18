import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { jusePAdapter } from "../../../../src/adapters/publishers/juse-p.js";
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

describe("jusePAdapter", () => {
  describe("search()", () => {
    it("書籍一覧を BookRecord[] で返す", async () => {
      const body = await loadFixture("juse-p-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.juse-p.co.jp/products",
        { status: 200, body },
      );

      const results = await jusePAdapter.search({ title: "Python" }, makeDeps(http));

      assert.strictEqual(results.length, 1);
      assert.partialDeepStrictEqual(results[0], {
        title: "Pythonによるデータサイエンス・AI",
        publisher: "日科技連出版社",
        url: "https://www.juse-p.co.jp/products/view/1051",
      });
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("juse-p-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.juse-p.co.jp/products",
        { status: 200, body },
      );

      const results = await jusePAdapter.search({ title: "Python" }, makeDeps(http));

      assert.strictEqual(
        results[0].coverImageUrl,
        "https://www.juse-p.co.jp/img/Product/1051/ssk_cvfl/9784817198181.jpg",
      );
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await jusePAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("検索リクエストに keyword が含まれる", async () => {
      const body = await loadFixture("juse-p-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.juse-p.co.jp/products",
        { status: 200, body },
      );

      await jusePAdapter.search({ title: "Python" }, makeDeps(http));

      assert.ok(http.calls[0].includes("k=Python"));
    });

    it("author のみで検索できる", async () => {
      const body = await loadFixture("juse-p-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.juse-p.co.jp/products",
        { status: 200, body },
      );

      await jusePAdapter.search({ author: "和田尚之" }, makeDeps(http));

      assert.ok(http.calls[0].includes("k=%E5%92%8C%E7%94%B0%E5%B0%9A%E4%B9%8B"));
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す", async () => {
      const body = await loadFixture("juse-p-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.juse-p.co.jp/products/view/1051",
        { status: 200, body },
      );

      const book = await jusePAdapter.getDetail(
        "https://www.juse-p.co.jp/products/view/1051",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "Pythonによるデータサイエンス・AI 多変量解析・時系列分析・機械学習・深層学習から少量データ学習へ",
        publisher: "日科技連出版社",
        isbn: "9784817198181",
        price: 5500,
      });
    });

    it("著者の役割語を除去する", async () => {
      const body = await loadFixture("juse-p-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.juse-p.co.jp/products/view/1051",
        { status: 200, body },
      );

      const book = await jusePAdapter.getDetail(
        "https://www.juse-p.co.jp/products/view/1051",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.authors, ["武藤佳恭", "和田尚之"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("juse-p-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.juse-p.co.jp/products/view/1051",
        { status: 200, body },
      );

      const book = await jusePAdapter.getDetail(
        "https://www.juse-p.co.jp/products/view/1051",
        makeDeps(http),
      );

      assert.strictEqual(
        book.coverImageUrl,
        "https://www.juse-p.co.jp/img/Product/1051/ssk_cvfl/9784817198181.jpg",
      );
    });

    it("ebookStores は空配列", async () => {
      const body = await loadFixture("juse-p-detail.html");
      const http = new MockHttpClient().addResponse(
        "https://www.juse-p.co.jp/products/view/1051",
        { status: 200, body },
      );

      const book = await jusePAdapter.getDetail(
        "https://www.juse-p.co.jp/products/view/1051",
        makeDeps(http),
      );

      assert.deepStrictEqual(book.ebookStores, []);
    });
  });
});
