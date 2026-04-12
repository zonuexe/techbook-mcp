import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { searchBooks } from "../../../src/application/search-books.js";
import type { PublisherAdapter, PublisherDeps } from "../../../src/domain/publisher.js";
import type { BookRecord } from "../../../src/domain/book.js";
import { MockHttpClient } from "../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../src/adapters/cache/null-cache.js";

/** ランタイム非依存の最小モック関数 */
function mockFn<T>(impl: (...args: unknown[]) => T = () => undefined as T) {
  const _calls: { arguments: unknown[] }[] = [];
  const fn = Object.assign(
    (...args: unknown[]) => {
      _calls.push({ arguments: args });
      return impl(...args);
    },
    { mock: { calls: _calls, callCount: () => _calls.length } },
  );
  return fn;
}

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
    search: mockFn(async () => books),
    getDetail: mockFn(),
  };
}

describe("searchBooks()", () => {
  it("全アダプターの結果を結合して返す", async () => {
    const book1 = makeBook({ title: "本A", url: "https://a.example.com/1" });
    const book2 = makeBook({ title: "本B", url: "https://b.example.com/1" });
    const publishers = [makeAdapter("a", [book1]), makeAdapter("b", [book2])];

    const { books, errors } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    assert.strictEqual(books.length, 2);
    assert.strictEqual(books[0].title, "本A");
    assert.strictEqual(books[1].title, "本B");
    assert.strictEqual(errors.length, 0);
  });

  it("publisherId が指定された場合は該当アダプターのみ呼ぶ", async () => {
    const book = makeBook({ title: "本A" });
    const adapterA = makeAdapter("a", [book]);
    const adapterB = makeAdapter("b", []);
    const publishers = [adapterA, adapterB];

    const { books } = await searchBooks({ title: "テスト", publisherId: "a" }, publishers, makeDeps());

    assert.strictEqual(books.length, 1);
    assert.strictEqual((adapterA.search as ReturnType<typeof mockFn>).mock.callCount(), 1);
    assert.strictEqual((adapterB.search as ReturnType<typeof mockFn>).mock.callCount(), 0);
  });

  it("1つのアダプターが失敗しても他の結果は返す", async () => {
    const book = makeBook({ title: "成功" });
    const failingAdapter: PublisherAdapter = {
      id: "fail",
      name: "失敗社",
      baseUrl: "https://fail.example.com",
      search: mockFn(() => Promise.reject(new Error("network error"))),
      getDetail: mockFn(),
    };
    const publishers = [failingAdapter, makeAdapter("ok", [book])];

    const { books, errors } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    assert.strictEqual(books.length, 1);
    assert.strictEqual(books[0].title, "成功");
    assert.strictEqual(errors.length, 1);
    assert.deepStrictEqual(errors[0], { publisherId: "fail", message: "network error" });
  });

  it("全アダプターが失敗した場合は books が空で errors に全件入る", async () => {
    const publishers = [
      { id: "a", name: "A社", baseUrl: "https://a.example.com", search: mockFn(() => Promise.reject(new Error("err A"))), getDetail: mockFn() },
      { id: "b", name: "B社", baseUrl: "https://b.example.com", search: mockFn(() => Promise.reject(new Error("err B"))), getDetail: mockFn() },
    ];

    const { books, errors } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    assert.strictEqual(books.length, 0);
    assert.strictEqual(errors.length, 2);
    assert.deepStrictEqual(errors.map(e => e.publisherId), ["a", "b"]);
  });

  it("Error 以外の例外も文字列化して errors に入れる", async () => {
    const publishers = [
      { id: "x", name: "X社", baseUrl: "https://x.example.com", search: mockFn(() => Promise.reject("string error")), getDetail: mockFn() },
    ];

    const { errors } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    assert.strictEqual(errors[0].message, "string error");
  });

  it("アダプターが0件のとき空配列を返す", async () => {
    const { books, errors } = await searchBooks({ title: "テスト" }, [], makeDeps());
    assert.deepStrictEqual(books, []);
    assert.deepStrictEqual(errors, []);
  });

  it("クエリをそのまま各アダプターの search() に渡す", async () => {
    const adapter = makeAdapter("a", []);
    const query = { title: "TypeScript", author: "山田", limit: 5 };

    await searchBooks(query, [adapter], makeDeps());

    assert.deepStrictEqual(
      (adapter.search as ReturnType<typeof mockFn>).mock.calls[0].arguments[0],
      query,
    );
  });
});
