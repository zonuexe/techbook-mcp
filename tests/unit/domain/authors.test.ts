import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeAuthors } from "../../../src/domain/authors.js";

describe("dedupeAuthors()", () => {
  it("完全重複を除き出現順を保つ", () => {
    assert.deepStrictEqual(
      dedupeAuthors(["吉川 邦夫", "別人", "吉川 邦夫"]),
      ["吉川 邦夫", "別人"],
    );
  });

  it("空白の有無など表記ゆれを同一視し、最初の表記を採用する", () => {
    assert.deepStrictEqual(
      dedupeAuthors(["吉川 邦夫", "吉川邦夫"]),
      ["吉川 邦夫"],
    );
  });

  it("空文字・空白のみは除去する", () => {
    assert.deepStrictEqual(dedupeAuthors(["著者", "", "  "]), ["著者"]);
  });

  it("重複がなければそのまま返す", () => {
    assert.deepStrictEqual(dedupeAuthors(["A", "B"]), ["A", "B"]);
  });
});
