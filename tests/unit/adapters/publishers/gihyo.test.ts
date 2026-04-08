import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gihyoAdapter } from "../../../../src/adapters/publishers/gihyo.js";
import { MockHttpClient } from "../../../../src/adapters/http/mock-client.js";
import { NullCacheStore } from "../../../../src/adapters/cache/null-cache.js";
import type { HtmlParser } from "../../../../src/ports/html-parser.js";

// gihyo は JSON API なのでパーサーは使わない
const noopParser: HtmlParser = {
  parse(_html) {
    throw new Error("gihyo adapter must not call HtmlParser");
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
});
