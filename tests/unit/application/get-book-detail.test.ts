import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { getBookDetail } from "../../../src/application/get-book-detail.js";
import type { PublisherAdapter, PublisherDeps } from "../../../src/domain/publisher.js";
import type { BookRecord } from "../../../src/domain/book.js";
import { MockHttpClient } from "../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../src/adapters/cache/null-cache.js";

function makeDeps(): PublisherDeps {
  return {
    http: new MockHttpClient(),
    parser: new CheerioHtmlParser(),
    cache: new NullCacheStore(),
  };
}

function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    title: "テスト本",
    authors: ["著者名"],
    publisher: "テスト社",
    url: "https://example.com/book/1",
    ...overrides,
  };
}

function makeAdapter(baseUrl: string, book: BookRecord): PublisherAdapter {
  return {
    id: "test",
    name: "テスト社",
    baseUrl,
    search: mock.fn(),
    getDetail: mock.fn(async () => book),
  };
}

describe("getBookDetail()", () => {
  it("URLに対応するアダプターの getDetail() を呼んで結果を返す", async () => {
    const book = makeBook({ title: "詳細情報テスト" });
    const adapter = makeAdapter("https://example.com", book);
    const url = "https://example.com/book/42";

    const result = await getBookDetail(url, [adapter], makeDeps());

    assert.deepStrictEqual(result, book);
    assert.strictEqual(
      (adapter.getDetail as ReturnType<typeof mock.fn>).mock.calls[0].arguments[0],
      url,
    );
  });

  it("baseUrl が前方一致するアダプターを選択する", async () => {
    const bookA = makeBook({ title: "A社の本" });
    const bookB = makeBook({ title: "B社の本" });
    const adapterA = makeAdapter("https://a.example.com", bookA);
    const adapterB = makeAdapter("https://b.example.com", bookB);

    const result = await getBookDetail("https://b.example.com/book/1", [adapterA, adapterB], makeDeps());

    assert.strictEqual(result.title, "B社の本");
    assert.strictEqual((adapterA.getDetail as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });

  it("対応するアダプターがなければエラーをスローする", async () => {
    const adapter = makeAdapter("https://other.example.com", makeBook());

    await assert.rejects(
      getBookDetail("https://unknown.example.com/book/1", [adapter], makeDeps()),
      /このURLに対応する出版社アダプターがありません/,
    );
  });

  it("エラーメッセージに対応URLリストを含む", async () => {
    const adapter = makeAdapter("https://example.com", makeBook());

    await assert.rejects(
      getBookDetail("https://unknown.example.com/book/1", [adapter], makeDeps()),
      /https:\/\/example\.com/,
    );
  });

  it("アダプターが空のときエラーをスローする", async () => {
    await assert.rejects(
      getBookDetail("https://example.com/book/1", [], makeDeps()),
      /このURLに対応する出版社アダプターがありません/,
    );
  });
});
