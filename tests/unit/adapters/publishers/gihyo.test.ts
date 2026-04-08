import { describe, it, expect } from "vitest";
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

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: "プロを目指す人のためのTypeScript入門 安全なコードの書き方から高度な型の使い方まで",
      authors: ["uhyo"],
      publisher: "技術評論社",
      isbn: "9784297128152",
      price: 3740,
      publishedAt: "2022-04-01",
    });
    expect(results[0].url).toBe("https://gihyo.jp/book/2022/978-4-297-12815-2");
    expect(results[0].coverImageUrl).toBe(
      "https://gihyo.jp/assets/images/cover/2022/9784297128152.jpg",
    );
  });

  it("サブタイトルなし書籍はタイトルのみになる", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");
    const results = await gihyoAdapter.search({ title: "TypeScript" }, deps);

    const book = results.find(b => b.isbn === "9784297136010");
    expect(book?.title).toBe("TypeScriptとReact/Next.jsでつくる実践Webアプリケーション開発");
  });

  it("複数著者が配列になる", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");
    const results = await gihyoAdapter.search({ title: "TypeScript" }, deps);

    const book = results.find(b => b.isbn === "9784297136010");
    expect(book?.authors).toEqual(["手島拓也", "吉田健人", "高林佳稀"]);
  });

  it("title も author も空の場合は [] を返しHTTPを呼ばない", async () => {
    const http = new MockHttpClient();
    const deps = { http, parser: noopParser, cache: new NullCacheStore() };

    const results = await gihyoAdapter.search({}, deps);

    expect(results).toEqual([]);
    expect(http.calls).toHaveLength(0);
  });

  it("search() のリクエストURLにクエリが含まれる", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");
    await gihyoAdapter.search({ title: "TypeScript" }, deps);

    expect(deps.http.calls[0]).toContain("search=TypeScript");
  });

  it("author クエリが API に渡される", async () => {
    const deps = await makeSearchDeps("gihyo-search.json");
    await gihyoAdapter.search({ author: "uhyo" }, deps);

    expect(deps.http.calls[0]).toContain("search=uhyo");
  });

  describe("getDetail()", () => {
    it("ebookStores にDRM-freeとDRM付きが含まれる", async () => {
      const deps = await makeDetailDeps();
      const book = await gihyoAdapter.getDetail(
        "https://gihyo.jp/book/2022/978-4-297-12815-2",
        deps,
      );

      expect(book.ebookStores).toBeDefined();
      const freeStores = book.ebookStores!.filter(s => s.drm === "free");
      const drmStores = book.ebookStores!.filter(s => s.drm === "drm");

      expect(freeStores).toHaveLength(1);
      expect(freeStores[0]).toMatchObject({
        name: "Gihyo Digital Publishing",
        drm: "free",
        url: expect.stringContaining("gihyo.jp/dp/ebook/"),
      });

      expect(drmStores.map(s => s.name)).toEqual(
        expect.arrayContaining(["Kindle", "楽天Kobo", "BookLive", "honto"]),
      );
    });

    it("ASIN が Amazon リンクから抽出される", async () => {
      const deps = await makeDetailDeps();
      const book = await gihyoAdapter.getDetail(
        "https://gihyo.jp/book/2022/978-4-297-12815-2",
        deps,
      );

      expect(book.asin).toBe("B09YGZ18ZK");
    });
  });
});
