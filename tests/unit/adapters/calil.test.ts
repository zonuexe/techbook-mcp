import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchCalilBook, CALIL_BASE_URL } from "../../../src/adapters/calil.js";
import { MockHttpClient } from "../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../src/adapters/cache/null-cache.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../fixtures");

function makeDeps(http: MockHttpClient) {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

describe("fetchCalilBook", () => {
  it("詳細ページから書誌情報を取得する", async () => {
    const body = await readFile(join(FIXTURES_DIR, "calil-book.html"), "utf-8");
    const http = new MockHttpClient().addResponse(
      `${CALIL_BASE_URL}/book/4901676032`,
      { status: 200, body },
    );
    const deps = makeDeps(http);

    const book = await fetchCalilBook("4901676032", deps);

    assert.ok(book !== null);
    assert.strictEqual(book.title, "PHPを使おう: PHPで広がるWebビジネス展開");
    assert.deepStrictEqual(book.authors, ["WebビジネスPHP研究部会"]);
    assert.strictEqual(book.publisher, "九天社");
    assert.strictEqual(book.publishedAt, "2002-02-01");
    assert.strictEqual(book.isbn, "9784901676038");
    assert.strictEqual(book.url, `${CALIL_BASE_URL}/book/4901676032`);
  });

  it("書影URLがAmazon CDNのURLで取得される", async () => {
    const body = await readFile(join(FIXTURES_DIR, "calil-book.html"), "utf-8");
    const http = new MockHttpClient().addResponse(
      `${CALIL_BASE_URL}/book/`,
      { status: 200, body },
    );

    const book = await fetchCalilBook("4901676032", makeDeps(http));

    assert.ok(book?.coverImageUrl?.includes("amazon") || book?.coverImageUrl?.includes("media-amazon"));
  });

  it("404相当のページ（タイトルなし）は null を返す", async () => {
    const http = new MockHttpClient().addResponse(
      `${CALIL_BASE_URL}/book/`,
      { status: 200, body: "<html><body></body></html>" },
    );

    const book = await fetchCalilBook("0000000000000", makeDeps(http));

    assert.strictEqual(book, null);
  });

  it("HTTPエラーは null を返す（エラーをスローしない）", async () => {
    const http = new MockHttpClient().addResponse(
      `${CALIL_BASE_URL}/book/`,
      { status: 404, body: "Not Found" },
    );

    const book = await fetchCalilBook("0000000000000", makeDeps(http));

    assert.strictEqual(book, null);
  });
});
