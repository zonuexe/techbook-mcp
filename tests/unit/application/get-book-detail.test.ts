import { describe, it, expect, vi } from "vitest";
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
    search: vi.fn(),
    getDetail: vi.fn().mockResolvedValue(book),
  };
}

describe("getBookDetail()", () => {
  it("URLに対応するアダプターの getDetail() を呼んで結果を返す", async () => {
    const book = makeBook({ title: "詳細情報テスト" });
    const adapter = makeAdapter("https://example.com", book);
    const url = "https://example.com/book/42";

    const result = await getBookDetail(url, [adapter], makeDeps());

    expect(result).toEqual(book);
    expect(adapter.getDetail).toHaveBeenCalledWith(url, expect.anything());
  });

  it("baseUrl が前方一致するアダプターを選択する", async () => {
    const bookA = makeBook({ title: "A社の本" });
    const bookB = makeBook({ title: "B社の本" });
    const adapterA = makeAdapter("https://a.example.com", bookA);
    const adapterB = makeAdapter("https://b.example.com", bookB);

    const result = await getBookDetail("https://b.example.com/book/1", [adapterA, adapterB], makeDeps());

    expect(result.title).toBe("B社の本");
    expect(adapterA.getDetail).not.toHaveBeenCalled();
  });

  it("対応するアダプターがなければエラーをスローする", async () => {
    const adapter = makeAdapter("https://other.example.com", makeBook());

    await expect(
      getBookDetail("https://unknown.example.com/book/1", [adapter], makeDeps()),
    ).rejects.toThrow("このURLに対応する出版社アダプターがありません");
  });

  it("エラーメッセージに対応URLリストを含む", async () => {
    const adapter = makeAdapter("https://example.com", makeBook());

    await expect(
      getBookDetail("https://unknown.example.com/book/1", [adapter], makeDeps()),
    ).rejects.toThrow("https://example.com");
  });

  it("アダプターが空のときエラーをスローする", async () => {
    await expect(
      getBookDetail("https://example.com/book/1", [], makeDeps()),
    ).rejects.toThrow("このURLに対応する出版社アダプターがありません");
  });
});
