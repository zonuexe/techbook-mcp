import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveBook, resolveBooks } from "../../../src/application/resolve-book.js";
import type { PublisherAdapter, PublisherDeps } from "../../../src/domain/publisher.js";
import type { BookRecord } from "../../../src/domain/book.js";
import { MockHttpClient } from "../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../src/adapters/cache/null-cache.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../fixtures");

function makeDeps(http = new MockHttpClient()): PublisherDeps {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
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
    search: async () => books,
    getDetail: async () => books[0],
  };
}

/** ISBN 経路用に openBD フィクスチャを返す MockHttpClient（ISBN 9784908686207 / 型システムのしくみ） */
async function httpWithOpenBD(): Promise<MockHttpClient> {
  const body = await readFile(join(FIXTURES_DIR, "openbd-response.json"), "utf-8");
  return new MockHttpClient().addResponse("https://api.openbd.jp/v1/get", { status: 200, body });
}

describe("resolveBook()", () => {
  describe("検索経路（ISBN なし）", () => {
    it("ベストマッチを matched / 高確信で返す", async () => {
      const publishers = [makeAdapter("a", [makeBook({ title: "Rust入門" })])];

      const r = await resolveBook({ title: "Rust入門" }, publishers, makeDeps());

      assert.strictEqual(r.status, "matched");
      assert.strictEqual(r.confidence, "high");
      assert.strictEqual(r.book?.title, "Rust入門");
      assert.strictEqual(r.matchScore, 1);
      assert.strictEqual(r.source, "search");
    });

    it("該当なしは not_found を返す", async () => {
      const publishers = [makeAdapter("a", [makeBook({ title: "Python超入門" })])];

      const r = await resolveBook({ title: "存在しない架空タイトルZZZ" }, publishers, makeDeps());

      assert.strictEqual(r.status, "not_found");
      assert.strictEqual(r.book, null);
      assert.ok(r.reason);
    });

    it("上位が拮抗していれば ambiguous で候補を返す", async () => {
      const publishers = [
        makeAdapter("a", [makeBook({ title: "Rust実践", url: "https://a/1" })]),
        makeAdapter("b", [makeBook({ title: "Rustの教科書", url: "https://b/1" })]),
      ];

      const r = await resolveBook({ title: "Rust" }, publishers, makeDeps());

      assert.strictEqual(r.status, "ambiguous");
      assert.ok(r.candidates && r.candidates.length === 2);
    });

    it("isbn / title / author すべて無指定は not_found", async () => {
      const r = await resolveBook({}, [], makeDeps());
      assert.strictEqual(r.status, "not_found");
    });
  });

  describe("ISBN 経路", () => {
    it("ISBN のみなら openBD から matched / 高確信で返す", async () => {
      const r = await resolveBook({ isbn: "9784908686207" }, [], makeDeps(await httpWithOpenBD()));

      assert.strictEqual(r.status, "matched");
      assert.strictEqual(r.confidence, "high");
      assert.strictEqual(r.source, "isbn:openbd");
      assert.strictEqual(r.book?.isbn, "9784908686207");
    });

    const FULL_TITLE = "型システムのしくみ TypeScriptで実装しながら学ぶ型とプログラミング言語";

    it("ISBN と title が完全一致すれば titleExact / 高確信", async () => {
      const r = await resolveBook(
        { isbn: "9784908686207", title: FULL_TITLE },
        [],
        makeDeps(await httpWithOpenBD()),
      );

      assert.strictEqual(r.confidence, "high");
      assert.deepStrictEqual(r.validation, {
        isbnTitleAgree: true,
        titleExact: true,
        sameWork: 1,
        editionDiffers: false,
      });
    });

    it("版表記だけ違えば同一作品として agree / editionDiffers=true / 高確信", async () => {
      const r = await resolveBook(
        { isbn: "9784908686207", title: `${FULL_TITLE} 第2版` },
        [],
        makeDeps(await httpWithOpenBD()),
      );

      assert.strictEqual(r.confidence, "high");
      assert.strictEqual(r.validation?.isbnTitleAgree, true);
      assert.strictEqual(r.validation?.titleExact, false);
      assert.strictEqual(r.validation?.editionDiffers, true);
      assert.ok((r.validation?.sameWork ?? 0) >= 0.9);
    });

    it("サブタイトル省略（版マーカー無し）は agree だが editionDiffers=false / 高確信", async () => {
      const r = await resolveBook(
        { isbn: "9784908686207", title: "型システムのしくみ" },
        [],
        makeDeps(await httpWithOpenBD()),
      );

      assert.strictEqual(r.confidence, "high");
      assert.strictEqual(r.validation?.isbnTitleAgree, true);
      assert.strictEqual(r.validation?.editionDiffers, false);
    });

    it("別作品なら誤ISBNとして agree=false / editionDiffers=false / 低確信", async () => {
      const r = await resolveBook(
        { isbn: "9784908686207", title: "全く無関係な別の本ZZZ" },
        [],
        makeDeps(await httpWithOpenBD()),
      );

      assert.strictEqual(r.confidence, "low");
      assert.strictEqual(r.validation?.isbnTitleAgree, false);
      assert.strictEqual(r.validation?.editionDiffers, false);
      assert.ok((r.validation?.sameWork ?? 1) < 0.5);
    });
  });
});

describe("resolveBooks()", () => {
  it("入力順に揃った結果配列を返す", async () => {
    const publishers = [makeAdapter("a", [makeBook({ title: "Rust入門" })])];

    const results = await resolveBooks(
      [{ title: "Rust入門" }, { title: "存在しない架空タイトルZZZ" }],
      publishers,
      makeDeps(),
    );

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].status, "matched");
    assert.strictEqual(results[1].status, "not_found");
  });
});
