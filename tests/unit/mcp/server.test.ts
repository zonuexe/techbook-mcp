import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeErrors } from "../../../src/mcp/server.js";
import type { SearchError } from "../../../src/application/search-books.js";

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
