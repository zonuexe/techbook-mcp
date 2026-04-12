import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PUBLISHERS } from "../../../src/adapters/publishers/registry.js";

describe("DEFAULT_PUBLISHERS", () => {
  it("アダプターが1件以上登録されている", () => {
    assert.ok(DEFAULT_PUBLISHERS.length > 0);
  });

  it("id がすべて一意である", () => {
    const ids = DEFAULT_PUBLISHERS.map(p => p.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length);
  });

  it("baseUrl がすべて一意である", () => {
    const urls = DEFAULT_PUBLISHERS.map(p => p.baseUrl);
    const uniqueUrls = new Set(urls);
    assert.strictEqual(uniqueUrls.size, urls.length);
  });

  it("各アダプターが必須フィールドを持つ", () => {
    for (const p of DEFAULT_PUBLISHERS) {
      assert.ok(p.id, `${p.id}: id が空`);
      assert.ok(p.name, `${p.id}: name が空`);
      assert.ok(p.baseUrl, `${p.id}: baseUrl が空`);
      assert.strictEqual(typeof p.search, "function", `${p.id}: search が関数でない`);
      assert.strictEqual(typeof p.getDetail, "function", `${p.id}: getDetail が関数でない`);
    }
  });

  it("baseUrl がすべて https:// で始まる", () => {
    for (const p of DEFAULT_PUBLISHERS) {
      assert.match(p.baseUrl, /^https:\/\//, `${p.id}: baseUrl が https でない`);
    }
  });
});
