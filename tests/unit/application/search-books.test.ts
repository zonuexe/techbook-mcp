import { describe, it, expect, vi } from "vitest";
import { searchBooks } from "../../../src/application/search-books.js";
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

function makeAdapter(id: string, books: BookRecord[]): PublisherAdapter {
  return {
    id,
    name: `${id} 出版社`,
    baseUrl: `https://${id}.example.com`,
    search: vi.fn().mockResolvedValue(books),
    getDetail: vi.fn(),
  };
}

describe("searchBooks()", () => {
  it("全アダプターの結果を結合して返す", async () => {
    const book1 = makeBook({ title: "本A", url: "https://a.example.com/1" });
    const book2 = makeBook({ title: "本B", url: "https://b.example.com/1" });
    const publishers = [makeAdapter("a", [book1]), makeAdapter("b", [book2])];

    const { books, errors } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    expect(books).toHaveLength(2);
    expect(books[0].title).toBe("本A");
    expect(books[1].title).toBe("本B");
    expect(errors).toHaveLength(0);
  });

  it("publisherId が指定された場合は該当アダプターのみ呼ぶ", async () => {
    const book = makeBook({ title: "本A" });
    const adapterA = makeAdapter("a", [book]);
    const adapterB = makeAdapter("b", []);
    const publishers = [adapterA, adapterB];

    const { books } = await searchBooks({ title: "テスト", publisherId: "a" }, publishers, makeDeps());

    expect(books).toHaveLength(1);
    expect(adapterA.search).toHaveBeenCalledOnce();
    expect(adapterB.search).not.toHaveBeenCalled();
  });

  it("1つのアダプターが失敗しても他の結果は返す", async () => {
    const book = makeBook({ title: "成功" });
    const failingAdapter: PublisherAdapter = {
      id: "fail",
      name: "失敗社",
      baseUrl: "https://fail.example.com",
      search: vi.fn().mockRejectedValue(new Error("network error")),
      getDetail: vi.fn(),
    };
    const publishers = [failingAdapter, makeAdapter("ok", [book])];

    const { books, errors } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("成功");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ publisherId: "fail", message: "network error" });
  });

  it("全アダプターが失敗した場合は books が空で errors に全件入る", async () => {
    const publishers = [
      { id: "a", name: "A社", baseUrl: "https://a.example.com", search: vi.fn().mockRejectedValue(new Error("err A")), getDetail: vi.fn() },
      { id: "b", name: "B社", baseUrl: "https://b.example.com", search: vi.fn().mockRejectedValue(new Error("err B")), getDetail: vi.fn() },
    ];

    const { books, errors } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    expect(books).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors.map(e => e.publisherId)).toEqual(["a", "b"]);
  });

  it("Error 以外の例外も文字列化して errors に入れる", async () => {
    const publishers = [
      { id: "x", name: "X社", baseUrl: "https://x.example.com", search: vi.fn().mockRejectedValue("string error"), getDetail: vi.fn() },
    ];

    const { errors } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    expect(errors[0].message).toBe("string error");
  });

  it("アダプターが0件のとき空配列を返す", async () => {
    const { books, errors } = await searchBooks({ title: "テスト" }, [], makeDeps());
    expect(books).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("クエリをそのまま各アダプターの search() に渡す", async () => {
    const adapter = makeAdapter("a", []);
    const query = { title: "TypeScript", author: "山田", limit: 5 };

    await searchBooks(query, [adapter], makeDeps());

    expect(adapter.search).toHaveBeenCalledWith(query, expect.anything());
  });
});
