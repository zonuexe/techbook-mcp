import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gihyoAdapter } from "../../../../src/adapters/publishers/gihyo.js";
import { MockHttpClient } from "../../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../../src/adapters/cache/null-cache.js";
import type { HtmlParser } from "../../../../src/ports/html-parser.js";

// search() は JSON API のみ使用するためパーサー不要
const noopParser: HtmlParser = {
  parse(_html) {
    throw new Error("gihyo adapter must not call HtmlParser during search()");
  },
};

const FIXTURES_DIR = join(import.meta.dirname, "../../../fixtures");

describe("gihyoAdapter", () => {
  async function makeSearchDeps(fixtureName: string) {
    const body = await readFile(join(FIXTURES_DIR, fixtureName), "utf-8");
    const http = new MockHttpClient().addResponse(
      "https://gihyo.jp/api_gh/site/search",
      { status: 200, body },
    );
    return { http, parser: noopParser, cache: new NullCacheStore() };
  }

  async function makeDetailDeps() {
    const [apiBody, htmlBody] = await Promise.all([
      readFile(join(FIXTURES_DIR, "gihyo-search.json"), "utf-8"),
      readFile(join(FIXTURES_DIR, "gihyo-detail.html"), "utf-8"),
    ]);
    const http = new MockHttpClient()
      .addResponse("https://gihyo.jp/api_gh/site/search", { status: 200, body: apiBody })
      .addResponse("https://gihyo.jp/book/", { status: 200, body: htmlBody });
    return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
  }

  it("search() が JSON API レスポンスから BookRecord[] を返す", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");

    const results = await gihyoAdapter.search({ title: "TypeScript", limit: 10 }, deps);

    assert.strictEqual(results.length, 2);
    assert.partialDeepStrictEqual(results[0], {
      title: "プロを目指す人のためのTypeScript入門 安全なコードの書き方から高度な型の使い方まで",
      authors: ["uhyo"],
      publisher: "技術評論社",
      isbn: "9784297128152",
      price: 3740,
      publishedAt: "2022-04-01",
    });
    assert.strictEqual(results[0].url, "https://gihyo.jp/book/2022/978-4-297-12815-2");
    assert.strictEqual(
      results[0].coverImageUrl,
      "https://gihyo.jp/assets/images/cover/2022/9784297128152.jpg",
    );
  });

  it("サブタイトルなし書籍はタイトルのみになる", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");
    const results = await gihyoAdapter.search({ title: "TypeScript" }, deps);

    const book = results.find(b => b.isbn === "9784297136010");
    assert.strictEqual(book?.title, "TypeScriptとReact/Next.jsでつくる実践Webアプリケーション開発");
  });

  it("複数著者が配列になる", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");
    const results = await gihyoAdapter.search({ title: "TypeScript" }, deps);

    const book = results.find(b => b.isbn === "9784297136010");
    assert.deepStrictEqual(book?.authors, ["手島拓也", "吉田健人", "高林佳稀"]);
  });

  it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
    const http = new MockHttpClient();
    const deps = { http, parser: noopParser, cache: new NullCacheStore() };

    const results = await gihyoAdapter.search({}, deps);

    assert.deepStrictEqual(results, []);
    assert.strictEqual(http.calls.length, 0);
  });

  it("search() のリクエストURLにクエリが含まれる", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");
    await gihyoAdapter.search({ title: "TypeScript" }, deps);

    assert.ok(deps.http.calls[0].includes("search=TypeScript"));
  });

  it("author クエリが API に渡される", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");
    await gihyoAdapter.search({ author: "uhyo" }, deps);

    assert.ok(deps.http.calls[0].includes("search=uhyo"));
  });

  describe("getDetail()", () => {
    it("ebookStores にソーシャルDRMとDRM付きが含まれる", async () => {
      const deps = await makeDetailDeps();
      const book = await gihyoAdapter.getDetail(
        "https://gihyo.jp/book/2022/978-4-297-12815-2",
        deps,
      );

      assert.ok(book.ebookStores !== undefined);
      const socialStores = book.ebookStores!.filter(s => s.drm === "social");
      const drmStores = book.ebookStores!.filter(s => s.drm === "drm");

      // Gihyo Digital Publishing は見えない購入者情報を埋め込むソーシャルDRM
      assert.strictEqual(socialStores.length, 1);
      assert.partialDeepStrictEqual(socialStores[0], {
        name: "Gihyo Digital Publishing",
        drm: "social",
      });
      assert.ok(socialStores[0].url.includes("gihyo.jp/dp/ebook/"));

      for (const name of ["Kindle", "楽天Kobo", "BookLive", "honto"]) {
        assert.ok(drmStores.some(s => s.name === name), `Expected DRM store: ${name}`);
      }
    });

    it("ASIN が Amazon リンクから抽出される", async () => {
      const deps = await makeDetailDeps();
      const book = await gihyoAdapter.getDetail(
        "https://gihyo.jp/book/2022/978-4-297-12815-2",
        deps,
      );

      assert.strictEqual(book.asin, "B09YGZ18ZK");
    });

    it("/dp/ebook/(電子)URL はキー不一致を吸収し公式 /book/ ページから ASIN を辿る", async () => {
      const deps = await makeDetailDeps();
      // 電子ISBN(URL末尾)は API が返すキー(紙ISBN)と一致しないが、先頭エントリを採用し
      // entry.url の公式 /book/ ページ(Amazon 動線あり)から ASIN を抽出する
      const book = await gihyoAdapter.getDetail(
        "https://gihyo.jp/dp/ebook/2099/978-4-297-15629-9",
        deps,
      );

      assert.strictEqual(book.asin, "B09YGZ18ZK");
      // 正準URLは公式 /book/ ページになる
      assert.strictEqual(book.url, "https://gihyo.jp/book/2022/978-4-297-12815-2");
    });
  });
});
