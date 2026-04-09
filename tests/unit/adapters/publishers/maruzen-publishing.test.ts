import { describe, it, expect } from "vitest";
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

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]).toMatchObject({
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

      expect(results[0].authors).toEqual(["ボリス・チェルニー", "折山文哉"]);
    });

    it("coverImageUrl が設定される", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      const results = await maruzenPublishingAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(results[0].coverImageUrl).toBe(
        "https://www.maruzen-publishing.co.jp/files/isbn/978-4-621-30855-1.jpg",
      );
    });

    it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();

      const results = await maruzenPublishingAdapter.search({}, makeDeps(http));

      expect(results).toEqual([]);
      expect(http.calls).toHaveLength(0);
    });

    it("検索リクエストに search_keyword が含まれる", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      await maruzenPublishingAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(http.calls[0]).toContain("search_keyword=TypeScript");
    });

    it("検索リクエストに format=1 が含まれる", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      await maruzenPublishingAdapter.search({ title: "TypeScript" }, makeDeps(http));

      expect(http.calls[0]).toContain("format=1");
    });

    it("3件取得できる", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      const results = await maruzenPublishingAdapter.search({ title: "プログラム" }, makeDeps(http));

      expect(results).toHaveLength(3);
    });

    it("監訳者の役割語も除去する", async () => {
      const body = await loadFixture("maruzen-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.maruzen-publishing.co.jp/search/",
        { status: 200, body },
      );

      const results = await maruzenPublishingAdapter.search({ title: "統計" }, makeDeps(http));
      const statsBook = results.find(r => r.title.includes("統計"));

      expect(statsBook?.authors).toEqual(["ピーター・ブルース", "アンドリュー・ブルース", "大橋真也"]);
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

      expect(book).toMatchObject({
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

      expect(book.authors).toEqual(["ボリス・チェルニー", "折山文哉"]);
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
      expect(storeNames).toContain("Kindle");
      expect(storeNames).toContain("Kinoppy");
      expect(storeNames).toContain("honto");
      expect(storeNames).not.toContain("Knowledge Worker");
    });
  });
});
