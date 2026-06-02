import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { looksLikeIsbn, normalizeIsbn } from "../../../src/domain/isbn.js";

describe("normalizeIsbn()", () => {
  it("ハイフン・空白・ISBN接頭辞を除去する", () => {
    assert.strictEqual(normalizeIsbn("ISBN 978-4-908686-20-7"), "9784908686207");
  });
});

describe("looksLikeIsbn()", () => {
  it("ISBN-13 (ハイフンあり) を認識する", () => {
    assert.ok(looksLikeIsbn("978-4-908686-20-7"));
  });

  it("ISBN-13 (ハイフンなし) を認識する", () => {
    assert.ok(looksLikeIsbn("9784908686207"));
  });

  it("ISBN-10 (末尾X) を認識する", () => {
    assert.ok(looksLikeIsbn("4-87311-336-X"));
  });

  it("通常の書名は ISBN とみなさない", () => {
    assert.ok(!looksLikeIsbn("実践Rustプログラミング入門"));
  });

  it("12桁など桁数違いは ISBN とみなさない", () => {
    assert.ok(!looksLikeIsbn("123456789012"));
  });
});
