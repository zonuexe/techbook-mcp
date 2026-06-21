import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeErrors, formatBook } from "../../../src/mcp/server.js";
import type { SearchError } from "../../../src/application/search-books.js";
import type { BookRecord } from "../../../src/domain/book.js";

describe("summarizeErrors()", () => {
  it("種別ごとに出版社をまとめて件数を集計する", () => {
    const errors: SearchError[] = [
      { publisherId: "a", type: "timeout", message: "タイムアウト (12000ms)" },
      { publisherId: "b", type: "timeout", message: "タイムアウト (12000ms)" },
      { publisherId: "c", type: "robots", message: "robots.txt によりアクセスが禁止されています: x" },
    ];

    const summary = summarizeErrors(errors);

    const timeout = summary.find(s => s["type"] === "timeout");
    const robots = summary.find(s => s["type"] === "robots");
    assert.deepStrictEqual(timeout?.["publishers"], ["a", "b"]);
    assert.strictEqual(timeout?.["count"], 2);
    assert.strictEqual(robots?.["count"], 1);
    assert.ok(typeof timeout?.["label"] === "string");
  });

  it("空配列なら空配列を返す", () => {
    assert.deepStrictEqual(summarizeErrors([]), []);
  });
});

describe("formatBook()", () => {
  function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
    return {
      title: "テスト本",
      authors: ["著者名"],
      publisher: "テスト社",
      url: "https://example.com/book/1",
      ...overrides,
    };
  }

  it("title の生改行・連続空白を畳む（スクレイピング由来のノイズ除去）", () => {
    const out = formatBook(
      makeBook({ title: "図解即戦力\nWeb技術がこれ1冊でしっかりわかる教科書" }),
    );
    assert.strictEqual(out["title"], "図解即戦力 Web技術がこれ1冊でしっかりわかる教科書");
  });

  it("subtitle も空白を畳む", () => {
    const out = formatBook(makeBook({ subtitle: "副題\n の途中改行" }));
    assert.strictEqual(out["subtitle"], "副題 の途中改行");
  });
});
