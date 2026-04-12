import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tatsuZineAdapter } from "../../../../src/adapters/publishers/tatsu-zine.js";
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

describe("tatsuZineAdapter", () => {
  describe("search()", () => {
    it("検索結果から BookRecord[] を返す", async () => {
      const body = await loadFixture("tatsu-zine-search.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/",
        { status: 200, body },
      );

      const results = await tatsuZineAdapter.search({ title: "Go" }, makeDeps(http));

      assert.strictEqual(results.length, 2);
      assert.partialDeepStrictEqual(results[0], {
        title: "Goプログラミング実践入門",
        authors: ["Sau Sheong Chang", "武舎 広幸"],
        publisher: "達人出版会",
      });
      assert.strictEqual(results[0].url, "https://tatsu-zine.com/books/go-programming");
    });

    it("ebookStores に達人出版会(ソーシャルDRM)が含まれる", async () => {
      const body = await loadFixture("tatsu-zine-search.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/",
        { status: 200, body },
      );

      const results = await tatsuZineAdapter.search({ title: "Go" }, makeDeps(http));

      assert.deepStrictEqual(results[0].ebookStores, [
        { name: "達人出版会", url: "https://tatsu-zine.com/books/go-programming", drm: "social" },
      ]);
    });

    it("limit を適用する", async () => {
      const body = await loadFixture("tatsu-zine-search.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/",
        { status: 200, body },
      );

      const results = await tatsuZineAdapter.search({ title: "Go", limit: 1 }, makeDeps(http));

      assert.strictEqual(results.length, 1);
    });

    it("title が未指定の場合は [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();
      const results = await tatsuZineAdapter.search({}, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("author のみ指定の場合も [] を返しHTTPを呼ばない", async () => {
      const http = new MockHttpClient();
      const results = await tatsuZineAdapter.search({ author: "Jesse Storimer" }, makeDeps(http));

      assert.deepStrictEqual(results, []);
      assert.strictEqual(http.calls.length, 0);
    });

    it("書籍一覧ページ全体を取得してタイトルでフィルタする", async () => {
      const body = await loadFixture("tatsu-zine-search.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/",
        { status: 200, body },
      );

      await tatsuZineAdapter.search({ title: "Go言語" }, makeDeps(http));

      assert.strictEqual(http.calls[0], "https://tatsu-zine.com/books/");
    });

    it("ページネーションがある場合は全ページを取得してフィルタする", async () => {
      const page1 = `<!DOCTYPE html><html><body>
        <section class="pagination">
          <nav class="pagination">
            <a class="btn-pagination" href="/books?page=2">2</a>
            <a class="btn-pagination" href="/books?page=2">最後へ</a>
          </nav>
        </section>
        <article class="book">
          <h3 itemprop="name"><a href="/books/page1-book">ページ1の本</a></h3>
          <p itemprop="author" class="author">著者A(著)</p>
        </article>
      </body></html>`;
      const page2 = `<!DOCTYPE html><html><body>
        <article class="book">
          <h3 itemprop="name"><a href="/books/naruhounix">なるほどUnixプロセス ― Rubyで学ぶUnixの基礎</a></h3>
          <p itemprop="author" class="author">Jesse Storimer(著), 島田 浩二(訳), 角谷 信太郎(訳)</p>
        </article>
      </body></html>`;
      const http = new MockHttpClient()
        .addResponse("https://tatsu-zine.com/books/", { status: 200, body: page1 })
        .addResponse("https://tatsu-zine.com/books?page=2", { status: 200, body: page2 });

      const results = await tatsuZineAdapter.search({ title: "なるほどUnix" }, makeDeps(http));

      assert.strictEqual(results.length, 1);
      assert.partialDeepStrictEqual(results[0], {
        title: "なるほどUnixプロセス ― Rubyで学ぶUnixの基礎",
        authors: ["Jesse Storimer", "島田 浩二", "角谷 信太郎"],
        url: "https://tatsu-zine.com/books/naruhounix",
      });
    });
  });

  describe("getDetail()", () => {
    it("詳細情報を返す（達人出版会は常にソーシャルDRM）", async () => {
      const body = await loadFixture("tatsu-zine-detail-free.html");
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/go-programming",
        { status: 200, body },
      );

      const book = await tatsuZineAdapter.getDetail(
        "https://tatsu-zine.com/books/go-programming",
        makeDeps(http),
      );

      assert.partialDeepStrictEqual(book, {
        title: "Goプログラミング実践入門",
        authors: ["Sau Sheong Chang", "武舎 広幸"],
        publisher: "インプレス",
        price: 3520,
      });
      // 達人出版会は「ソーシャルDRM」と明記がなくても全書籍で購入者情報を印字
      assert.deepStrictEqual(book.ebookStores, [
        { name: "達人出版会", url: "https://tatsu-zine.com/books/go-programming", drm: "social" },
      ]);
    });

    it("出版社が達人出版会自身の場合はフォールバックする", async () => {
      const body = `<!DOCTYPE html><html><body>
        <h1>達人出版会刊行の本</h1>
        <img src="/images/books/999/cover.jpg">
        <dl><dt>著者</dt><dd>著者名(著)</dd><dt>定価</dt><dd>2,200円 (2,000円+税)</dd></dl>
      </body></html>`;
      const http = new MockHttpClient().addResponse(
        "https://tatsu-zine.com/books/some-book",
        { status: 200, body },
      );

      const book = await tatsuZineAdapter.getDetail(
        "https://tatsu-zine.com/books/some-book",
        makeDeps(http),
      );

      assert.strictEqual(book.publisher, "達人出版会");
    });
  });
});
