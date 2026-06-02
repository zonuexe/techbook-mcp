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

    const { books, errors } = await searchBooks({ title: "本" }, publishers, makeDeps());

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

    const { books } = await searchBooks({ title: "本", publisherId: "a" }, publishers, makeDeps());

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

    const { books, errors } = await searchBooks({ title: "成功" }, publishers, makeDeps());

    assert.strictEqual(books.length, 1);
    assert.strictEqual(books[0].title, "成功");
    assert.strictEqual(errors.length, 1);
    assert.deepStrictEqual(errors[0], { publisherId: "fail", type: "other", message: "network error" });
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

  it("scale: \"minor\" の出版社を大規模出版社より後に呼ぶ", async () => {
    const order: string[] = [];
    const makeTracked = (id: string, scale?: "minor"): PublisherAdapter => ({
      id,
      name: `${id}社`,
      baseUrl: `https://${id}.example.com`,
      scale,
      search: mockFn(async () => {
        order.push(id);
        return [];
      }),
      getDetail: mockFn(),
    });
    // 並列度1相当に十分な順序保証のため minor を先頭に置いても後回しになることを確認
    const publishers = [makeTracked("minor1", "minor"), makeTracked("major1"), makeTracked("major2")];

    await searchBooks({ title: "x" }, publishers, makeDeps());

    // major が minor より前に呼ばれている
    assert.ok(order.indexOf("major1") < order.indexOf("minor1"), `order=${order.join(",")}`);
    assert.ok(order.indexOf("major2") < order.indexOf("minor1"), `order=${order.join(",")}`);
  });

  it("失敗理由を type で分類する", async () => {
    const publishers: PublisherAdapter[] = [
      { id: "r", name: "R", baseUrl: "https://r.example.com", search: mockFn(() => Promise.reject(new Error("robots.txt によりアクセスが禁止されています: x"))), getDetail: mockFn() },
      { id: "h", name: "H", baseUrl: "https://h.example.com", search: mockFn(() => Promise.reject(new Error("HTTP 503: x"))), getDetail: mockFn() },
    ];

    const { errors } = await searchBooks({ title: "x" }, publishers, makeDeps());
    const byId = new Map(errors.map(e => [e.publisherId, e.type]));

    assert.strictEqual(byId.get("r"), "robots");
    assert.strictEqual(byId.get("h"), "http");
  });

  it("matchScore を付与しベストマッチ順に並べ、無関係本は除外する", async () => {
    const exact = makeBook({ title: "Rust入門", url: "https://a.example.com/1" });
    const partial = makeBook({ title: "実践Rust入門ガイド", url: "https://b.example.com/1" });
    const unrelated = makeBook({ title: "Python超入門", url: "https://c.example.com/1" });
    const publishers = [
      makeAdapter("a", [unrelated]),
      makeAdapter("b", [partial]),
      makeAdapter("c", [exact]),
    ];

    const { books } = await searchBooks({ title: "Rust入門" }, publishers, makeDeps());

    // 一致度ゼロの "Python超入門" は除外される
    assert.deepStrictEqual(
      books.map(b => b.title),
      ["Rust入門", "実践Rust入門ガイド"],
    );
    assert.strictEqual(books[0].matchScore, 1);
    assert.ok(books[1].matchScore < 1 && books[1].matchScore > 0);
  });

  it("一致する書籍がなければ空配列を返す（無関係本でフォールバックしない）", async () => {
    const fallback = makeBook({ title: "ゲームを進化させるデータ分析完全ガイド" });
    const publishers = [makeAdapter("a", [fallback])];

    const { books } = await searchBooks({ title: "コマンドラインの黒い画面" }, publishers, makeDeps());

    assert.deepStrictEqual(books, []);
  });

  it("著者の重複を除く", async () => {
    const book = makeBook({ title: "詳解本", authors: ["吉川 邦夫", "吉川邦夫", "別人"] });
    const publishers = [makeAdapter("a", [book])];

    const { books } = await searchBooks({ title: "詳解本" }, publishers, makeDeps());

    assert.deepStrictEqual(books[0].authors, ["吉川 邦夫", "別人"]);
  });

  it("language 未設定の書籍に既定言語 \"ja\" を刻む", async () => {
    const publishers = [makeAdapter("a", [makeBook()])];

    const { books } = await searchBooks({ title: "テスト" }, publishers, makeDeps());

    assert.strictEqual(books[0].language, "ja");
  });

  it("アダプターの language を使い、書籍が持つ language は上書きしない", async () => {
    const enAdapter: PublisherAdapter = {
      ...makeAdapter("en", [makeBook()]),
      language: "en",
    };
    const explicitAdapter = makeAdapter("x", [makeBook({ language: "fr" })]);

    const { books } = await searchBooks(
      { title: "テスト" },
      [enAdapter, explicitAdapter],
      makeDeps(),
    );

    assert.strictEqual(books[0].language, "en");
    assert.strictEqual(books[1].language, "fr");
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
