import { describe, it, expect } from "vitest";
import { DEFAULT_PUBLISHERS } from "../../../src/adapters/publishers/registry.js";

describe("DEFAULT_PUBLISHERS", () => {
  it("アダプターが1件以上登録されている", () => {
    expect(DEFAULT_PUBLISHERS.length).toBeGreaterThan(0);
  });

  it("id がすべて一意である", () => {
    const ids = DEFAULT_PUBLISHERS.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("baseUrl がすべて一意である", () => {
    const urls = DEFAULT_PUBLISHERS.map(p => p.baseUrl);
    const uniqueUrls = new Set(urls);
    expect(uniqueUrls.size).toBe(urls.length);
  });

  it("各アダプターが必須フィールドを持つ", () => {
    for (const p of DEFAULT_PUBLISHERS) {
      expect(p.id, `${p.id}: id が空`).toBeTruthy();
      expect(p.name, `${p.id}: name が空`).toBeTruthy();
      expect(p.baseUrl, `${p.id}: baseUrl が空`).toBeTruthy();
      expect(typeof p.search, `${p.id}: search が関数でない`).toBe("function");
      expect(typeof p.getDetail, `${p.id}: getDetail が関数でない`).toBe("function");
    }
  });

  it("baseUrl がすべて https:// で始まる", () => {
    for (const p of DEFAULT_PUBLISHERS) {
      expect(p.baseUrl, `${p.id}: baseUrl が https でない`).toMatch(/^https:\/\//);
    }
  });
});
