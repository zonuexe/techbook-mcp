import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { lambdanoteAdapter } from "../../../../src/adapters/publishers/lambdanote.js";
import { MockHttpClient } from "../../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../../src/adapters/cache/null-cache.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../../fixtures");

function makeDeps(http: MockHttpClient) {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

describe("lambdanoteAdapter", () => {
  it("search() が HTML 検索結果から BookRecord[] を返す", async () => {
    const body = await readFile(join(FIXTURES_DIR, "lambdanote-search.html"), "utf-8");
    const http = new MockHttpClient().addResponse(
      "https://www.lambdanote.com/search",
      { status: 200, body },
    );

    const results = await lambdanoteAdapter.search({ title: "Go" }, makeDeps(http));

    assert.strictEqual(results.length, 2);
    assert.partialDeepStrictEqual(results[0], {
      title: "Goならわかるシステムプログラミング 第2版",
      publisher: "ラムダノート",
      price: 3960,
    });
    assert.strictEqual(results[0].url, "https://www.lambdanote.com/products/go-2");
    assert.ok(results[0].coverImageUrl?.includes("go2_small.jpg"));
  });

  it("2件目の書籍も正しく取得できる", async () => {
    const body = await readFile(join(FIXTURES_DIR, "lambdanote-search.html"), "utf-8");
    const http = new MockHttpClient().addResponse(
      "https://www.lambdanote.com/search",
      { status: 200, body },
    );

    const results = await lambdanoteAdapter.search({ title: "Go" }, makeDeps(http));

    assert.partialDeepStrictEqual(results[1], {
      title: "プログラミング言語Go",
      price: 4400,
    });
    assert.strictEqual(results[1].url, "https://www.lambdanote.com/products/gopl");
  });

  it("limit を適用する", async () => {
    const body = await readFile(join(FIXTURES_DIR, "lambdanote-search.html"), "utf-8");
    const http = new MockHttpClient().addResponse(
      "https://www.lambdanote.com/search",
      { status: 200, body },
    );

    const results = await lambdanoteAdapter.search({ title: "Go", limit: 1 }, makeDeps(http));

    assert.strictEqual(results.length, 1);
  });

  it("結果ゼロの場合は [] を返す", async () => {
    const body = `<!DOCTYPE html><html><body>
      <ul class="search-results__list"></ul>
    </body></html>`;
    const http = new MockHttpClient().addResponse(
      "https://www.lambdanote.com/search",
      { status: 200, body },
    );

    const results = await lambdanoteAdapter.search({ title: "存在しない本" }, makeDeps(http));

    assert.deepStrictEqual(results, []);
  });

  it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
    const http = new MockHttpClient();
    const results = await lambdanoteAdapter.search({}, makeDeps(http));

    assert.deepStrictEqual(results, []);
    assert.strictEqual(http.calls.length, 0);
  });
});
