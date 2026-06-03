import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchOpenBDBooks, enrichWithOpenBD, openBDEntryToBookRecord } from "../../../src/adapters/openbd.js";
import type { OpenBDEntry } from "../../../src/adapters/openbd.js";
import { MockHttpClient } from "../../../src/adapters/http/mock-client.js";
import { NullCacheStore } from "../../../src/adapters/cache/null-cache.js";
import type { HtmlParser } from "../../../src/ports/html-parser.js";
import type { BookRecord } from "../../../src/domain/book.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../fixtures");

const noopParser: HtmlParser = {
  parse(_html) {
    throw new Error("openBD adapter must not call HtmlParser");
  },
};

function makeDeps(http: MockHttpClient) {
  return { http, parser: noopParser, cache: new NullCacheStore() };
}

describe("fetchOpenBDBooks", () => {
  it("ISBNに対応するエントリをMapで返す", async () => {
    const body = await readFile(join(FIXTURES_DIR, "openbd-response.json"), "utf-8");
    const http = new MockHttpClient().addResponse(
      "https://api.openbd.jp/v1/get",
      { status: 200, body },
    );
    const deps = makeDeps(http);

    const result = await fetchOpenBDBooks(["9784908686207"], deps);

    assert.strictEqual(result.size, 1);
    const entry = result.get("9784908686207");
    assert.ok(entry !== undefined);
    assert.strictEqual(entry.summary.isbn, "9784908686207");
    assert.strictEqual(entry.summary.publisher, "ラムダノート");
    assert.strictEqual(entry.summary.pubdate, "20250418");
    assert.strictEqual(entry.summary.cover, "https://cover.openbd.jp/9784908686207.jpg");
  });

  it("APIレスポンスのnullエントリはMapに含まれない", async () => {
    const body = JSON.stringify([null]);
    const http = new MockHttpClient().addResponse(
      "https://api.openbd.jp/v1/get",
      { status: 200, body },
    );
    const deps = makeDeps(http);

    const result = await fetchOpenBDBooks(["9780000000000"], deps);

    assert.strictEqual(result.size, 0);
  });

  it("複数ISBNを一括取得してカンマ区切りURLを呼ぶ", async () => {
    const body = await readFile(join(FIXTURES_DIR, "openbd-response.json"), "utf-8");
    // 2件リクエスト、1件はnull
    const twoEntries = JSON.parse(body) as OpenBDEntry[];
    const batchBody = JSON.stringify([twoEntries[0], null]);
    const http = new MockHttpClient().addResponse(
      "https://api.openbd.jp/v1/get",
      { status: 200, body: batchBody },
    );
    const deps = makeDeps(http);

    const result = await fetchOpenBDBooks(["9784908686207", "9780000000000"], deps);

    assert.strictEqual(result.size, 1);
    assert.ok(result.has("9784908686207"));
    assert.ok(!result.has("9780000000000"));
    assert.ok(deps.http.calls[0].includes("9784908686207,9780000000000"));
  });

  it("ISBNリストが空の場合はHTTPを呼ばず空Mapを返す", async () => {
    const http = new MockHttpClient();
    const deps = makeDeps(http);

    const result = await fetchOpenBDBooks([], deps);

    assert.strictEqual(result.size, 0);
    assert.strictEqual(http.calls.length, 0);
  });
});

describe("enrichWithOpenBD", () => {
  let entry: OpenBDEntry;

  // フィクスチャを同期的にセットアップするためにbeforeを使わず直接使用
  async function loadEntry(): Promise<OpenBDEntry> {
    const body = await readFile(join(FIXTURES_DIR, "openbd-response.json"), "utf-8");
    return (JSON.parse(body) as OpenBDEntry[])[0];
  }

  it("欠損フィールドをopenBDデータで補完する", async () => {
    entry = await loadEntry();
    const book: BookRecord = {
      title: "型システムのしくみ",
      authors: ["遠藤侑介"],
      publisher: "ラムダノート",
      url: "https://www.lambdanote.com/products/type-systems",
      isbn: "9784908686207",
    };

    const enriched = enrichWithOpenBD(book, entry);

    assert.strictEqual(enriched.publishedAt, "2025-04-18");
    assert.strictEqual(enriched.price, 3300);
    assert.strictEqual(enriched.coverImageUrl, "https://cover.openbd.jp/9784908686207.jpg");
    assert.strictEqual(
      enriched.description,
      "TypeScriptのサブセットを実装しながら、型推論・型検査・多相型・ジェネリクスのしくみを一から学べる実践的な解説書。",
    );
  });

  it("authors が空のとき openBD の著者で補完する", async () => {
    entry = await loadEntry();
    const book: BookRecord = {
      title: "型システムのしくみ",
      authors: [],
      publisher: "ラムダノート",
      url: "https://www.lambdanote.com/products/type-systems",
      isbn: "9784908686207",
    };

    const enriched = enrichWithOpenBD(book, entry);

    assert.deepStrictEqual(enriched.authors, ["遠藤侑介"]);
  });

  it("ONIX contributor が無ければ summary.author から役割語を除去し重複を除く", async () => {
    entry = await loadEntry();
    const entryWithRoles: OpenBDEntry = {
      ...entry,
      summary: { ...entry.summary, author: "結城浩／著、結城浩／著、北原かな／訳" },
      onix: { ...entry.onix, DescriptiveDetail: undefined },
    };
    const book: BookRecord = {
      title: "x",
      authors: [],
      publisher: "x",
      url: "https://example.com",
    };

    const enriched = enrichWithOpenBD(book, entryWithRoles);

    assert.deepStrictEqual(enriched.authors, ["結城浩", "北原かな"]);
  });

  it("ONIX contributor から役割つき著者を取り名前を整形する（SequenceNumber順）", async () => {
    entry = await loadEntry();
    const e: OpenBDEntry = {
      ...entry,
      onix: {
        ...entry.onix,
        DescriptiveDetail: {
          Contributor: [
            { SequenceNumber: "2", ContributorRole: ["B06"], PersonName: { content: "角, 征典" } },
            { SequenceNumber: "1", ContributorRole: ["A01"], PersonName: { content: "Boswell, Dustin" } },
          ],
        },
      },
    };

    const book = openBDEntryToBookRecord(e);

    // ASCII は "First Last"、和名は "姓 名"、SequenceNumber 昇順
    assert.deepStrictEqual(book.contributors, [
      { name: "Dustin Boswell", role: "author" },
      { name: "角 征典", role: "translator" },
    ]);
    assert.deepStrictEqual(book.authors, ["Dustin Boswell", "角 征典"]);
  });

  it("enrichWithOpenBD は ONIX から役割つき contributors を補完する", async () => {
    entry = await loadEntry();  // フィクスチャは A01 遠藤侑介 を持つ
    const book: BookRecord = { title: "x", authors: [], publisher: "x", url: "https://example.com" };

    const enriched = enrichWithOpenBD(book, entry);

    assert.deepStrictEqual(enriched.contributors, [{ name: "遠藤侑介", role: "author" }]);
  });

  it("authors が非空なら上書きしない", async () => {
    entry = await loadEntry();
    const book: BookRecord = {
      title: "型システムのしくみ",
      authors: ["別の著者"],
      publisher: "ラムダノート",
      url: "https://www.lambdanote.com/products/type-systems",
      isbn: "9784908686207",
    };

    const enriched = enrichWithOpenBD(book, entry);

    assert.deepStrictEqual(enriched.authors, ["別の著者"]);
  });

  it("既存フィールドは上書きしない", async () => {
    entry = await loadEntry();
    const book: BookRecord = {
      title: "型システムのしくみ",
      authors: ["遠藤侑介"],
      publisher: "ラムダノート",
      url: "https://www.lambdanote.com/products/type-systems",
      isbn: "9784908686207",
      publishedAt: "2025-01-01",
      price: 9999,
      coverImageUrl: "https://example.com/cover.jpg",
      description: "既存の説明文",
    };

    const enriched = enrichWithOpenBD(book, entry);

    assert.strictEqual(enriched.publishedAt, "2025-01-01");
    assert.strictEqual(enriched.price, 9999);
    assert.strictEqual(enriched.coverImageUrl, "https://example.com/cover.jpg");
    assert.strictEqual(enriched.description, "既存の説明文");
  });

  it("TextType 03がなければ 02 にフォールバックする", async () => {
    entry = await loadEntry();
    // TextType "03" を除去
    const entryWithout03: OpenBDEntry = {
      ...entry,
      onix: {
        ...entry.onix,
        CollateralDetail: {
          TextContent: entry.onix.CollateralDetail?.TextContent?.filter(
            t => t.TextType !== "03",
          ),
        },
      },
    };
    const book: BookRecord = {
      title: "型システムのしくみ",
      authors: [],
      publisher: "ラムダノート",
      url: "https://www.lambdanote.com/products/type-systems",
    };

    const enriched = enrichWithOpenBD(book, entryWithout03);

    assert.strictEqual(
      enriched.description,
      "現代のすべてのプログラミング言語の基礎理論である「型」を、プログラマー向けに解き明かした初の概説書！",
    );
  });

  it("pubdate が不正な場合は publishedAt を設定しない", async () => {
    entry = await loadEntry();
    const badEntry: OpenBDEntry = {
      ...entry,
      summary: { ...entry.summary, pubdate: "" },
    };
    const book: BookRecord = {
      title: "テスト",
      authors: [],
      publisher: "テスト",
      url: "https://example.com",
    };

    const enriched = enrichWithOpenBD(book, badEntry);

    assert.strictEqual(enriched.publishedAt, undefined);
  });
});
