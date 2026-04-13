import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getBookByIsbn } from "../../../src/application/get-book-by-isbn.js";
import type { PublisherAdapter, PublisherDeps } from "../../../src/domain/publisher.js";
import type { BookRecord } from "../../../src/domain/book.js";
import { MockHttpClient } from "../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../src/adapters/cache/null-cache.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../fixtures");

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

// openBD が返す storelink と一致する baseUrl を持つアダプター
const LAMBDANOTE_BASE_URL = "https://www.lambdanote.com";
const LAMBDANOTE_STORELINK = "https://www.lambdanote.com/collections/type-systems";

function makeDetailBook(): BookRecord {
  return {
    title: "型システムのしくみ（出版社サイト取得）",
    authors: ["遠藤侑介"],
    publisher: "ラムダノート",
    url: LAMBDANOTE_STORELINK,
    isbn: "9784908686207",
    price: 3300,
  };
}

function makeAdapter(baseUrl: string, book: BookRecord): PublisherAdapter {
  return {
    id: "lambdanote",
    name: "ラムダノート",
    baseUrl,
    search: mockFn(),
    getDetail: mockFn(async () => book),
  };
}

async function makeOpenBDDeps(http: MockHttpClient): Promise<PublisherDeps> {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

async function makeHttpWithOpenBD(): Promise<MockHttpClient> {
  const openBDBody = await readFile(join(FIXTURES_DIR, "openbd-response.json"), "utf-8");
  // hanmoto.storelink を追加してフィクスチャを加工
  const data = JSON.parse(openBDBody);
  data[0].hanmoto = { isbn: "9784908686207", storelink: LAMBDANOTE_STORELINK };
  return new MockHttpClient().addResponse(
    "https://api.openbd.jp/v1/get",
    { status: 200, body: JSON.stringify(data) },
  );
}

describe("getBookByIsbn()", () => {
  it("storelink が既知アダプターと一致する場合は getDetail() を呼ぶ", async () => {
    const http = await makeHttpWithOpenBD();
    const deps = await makeOpenBDDeps(http);
    const detailBook = makeDetailBook();
    const adapter = makeAdapter(LAMBDANOTE_BASE_URL, detailBook);

    const result = await getBookByIsbn("9784908686207", [adapter], deps);

    assert.strictEqual(result.title, "型システムのしくみ（出版社サイト取得）");
    assert.strictEqual(
      (adapter.getDetail as ReturnType<typeof mockFn>).mock.calls[0].arguments[0],
      LAMBDANOTE_STORELINK,
    );
  });

  it("getDetail() が失敗した場合は openBD データで返す", async () => {
    const http = await makeHttpWithOpenBD();
    const deps = await makeOpenBDDeps(http);
    const adapter: PublisherAdapter = {
      id: "lambdanote",
      name: "ラムダノート",
      baseUrl: LAMBDANOTE_BASE_URL,
      search: mockFn(),
      getDetail: mockFn(async () => { throw new Error("詳細取得失敗"); }),
    };

    const result = await getBookByIsbn("9784908686207", [adapter], deps);

    // フォールバックとして openBD のデータが返る
    assert.strictEqual(result.isbn, "9784908686207");
    assert.strictEqual(result.publisher, "ラムダノート");
    assert.strictEqual(result.url, LAMBDANOTE_STORELINK);
  });

  it("storelink が既知アダプターと一致しない場合は openBD データで返す", async () => {
    const openBDBody = await readFile(join(FIXTURES_DIR, "openbd-response.json"), "utf-8");
    const data = JSON.parse(openBDBody);
    data[0].hanmoto = { isbn: "9784908686207", storelink: "https://unknown-store.example.com/books/1" };
    const http = new MockHttpClient().addResponse(
      "https://api.openbd.jp/v1/get",
      { status: 200, body: JSON.stringify(data) },
    );
    const deps = await makeOpenBDDeps(http);
    const adapter = makeAdapter(LAMBDANOTE_BASE_URL, makeDetailBook());

    const result = await getBookByIsbn("9784908686207", [adapter], deps);

    assert.strictEqual(result.isbn, "9784908686207");
    assert.strictEqual((adapter.getDetail as ReturnType<typeof mockFn>).mock.callCount(), 0);
  });

  it("storelink がない場合は openBD データで返す", async () => {
    const openBDBody = await readFile(join(FIXTURES_DIR, "openbd-response.json"), "utf-8");
    // storelink を持たない hanmoto に差し替え
    const data = JSON.parse(openBDBody);
    data[0].hanmoto = { isbn: "9784908686207" };
    const http = new MockHttpClient().addResponse(
      "https://api.openbd.jp/v1/get",
      { status: 200, body: JSON.stringify(data) },
    );
    const deps = await makeOpenBDDeps(http);
    const adapter = makeAdapter(LAMBDANOTE_BASE_URL, makeDetailBook());

    const result = await getBookByIsbn("9784908686207", [adapter], deps);

    assert.strictEqual(result.isbn, "9784908686207");
    assert.strictEqual((adapter.getDetail as ReturnType<typeof mockFn>).mock.callCount(), 0);
  });

  it("openBD に存在しない ISBN はエラーをスローする", async () => {
    const http = new MockHttpClient().addResponse(
      "https://api.openbd.jp/v1/get",
      { status: 200, body: JSON.stringify([null]) },
    );
    const deps = await makeOpenBDDeps(http);

    await assert.rejects(
      getBookByIsbn("9780000000000", [], deps),
      /openBDに書誌情報が見つかりません/,
    );
  });

  it("ISBNのハイフンを除去して正規化する", async () => {
    const http = await makeHttpWithOpenBD();
    const deps = await makeOpenBDDeps(http);

    // ハイフンありで渡しても openBD は正規化されたISBNで照合される
    await getBookByIsbn("978-4-908686-20-7", [makeAdapter(LAMBDANOTE_BASE_URL, makeDetailBook())], deps);

    assert.ok(deps.http.calls[0].includes("9784908686207"));
  });

  it("openBD データから著者が分割される", async () => {
    const openBDBody = await readFile(join(FIXTURES_DIR, "openbd-response.json"), "utf-8");
    const data = JSON.parse(openBDBody);
    // 複数著者をスラッシュ区切りで設定
    data[0].summary.author = "著者A/著者B";
    data[0].hanmoto = undefined;
    const http = new MockHttpClient().addResponse(
      "https://api.openbd.jp/v1/get",
      { status: 200, body: JSON.stringify(data) },
    );
    const deps = await makeOpenBDDeps(http);

    const result = await getBookByIsbn("9784908686207", [], deps);

    assert.deepStrictEqual(result.authors, ["著者A", "著者B"]);
  });
});
