import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findAdapterIdByIsbn,
  PUBLISHER_ISBN_CODES,
} from "../../../../src/adapters/publishers/isbn-publisher-codes.js";

describe("findAdapterIdByIsbn()", () => {
  const cases: Array<[string, string, string]> = [
    ["9784297128152", "gihyo",             "技術評論社"],
    ["9784339012347", "coronasha",         "コロナ社"],
    ["9784621306007", "maruzen-publishing","丸善出版"],
    ["9784781915913", "saiensu",           "サイエンス社"],
    ["9784814401093", "oreilly-japan",     "オライリー・ジャパン (新記号 8144)"],
    ["9784873116266", "oreilly-japan",     "オライリー・ジャパン (旧記号 87311)"],
    ["9784817198181", "juse-p",            "日科技連出版社"],
    ["9784908686047", "lambdanote",        "ラムダノート"],
    ["9784893621917", "personal-media",   "パーソナルメディア"],
    ["9784899774211", "rutles",            "ラトルズ"],
    ["9784798171418", "seshop",            "翔泳社"],
    ["9784844309840", "impress-books",      "インプレスブックス"],
    ["9784862463364", "born-digital",      "ボーンデジタル"],
    ["9784839998012", "manatee",           "マイナビ出版"],
    ["9784902312782", "optronics",         "オプトロニクス社"],
  ];

  for (const [isbn, expectedId, label] of cases) {
    it(`${label} (${isbn}) → "${expectedId}"`, () => {
      assert.strictEqual(findAdapterIdByIsbn(isbn), expectedId);
    });
  }

  it("ハイフンありISBNでも正しく解決できる", () => {
    assert.strictEqual(findAdapterIdByIsbn("978-4-297-12815-2"), "gihyo");
  });

  it("978-4 以外のISBNは undefined を返す", () => {
    assert.strictEqual(findAdapterIdByIsbn("9780134494166"), undefined);
    assert.strictEqual(findAdapterIdByIsbn("9783000000000"), undefined);
  });

  it("対応する出版社がないISBNは undefined を返す", () => {
    assert.strictEqual(findAdapterIdByIsbn("9784000000000"), undefined);
  });
});

describe("PUBLISHER_ISBN_CODES", () => {
  it("全アダプターIDが文字列", () => {
    for (const [id] of PUBLISHER_ISBN_CODES) {
      assert.ok(typeof id === "string" && id.length > 0, `id が空: ${id}`);
    }
  });

  it("全コードが数字のみ", () => {
    for (const [, codes] of PUBLISHER_ISBN_CODES) {
      for (const code of codes) {
        assert.match(code, /^\d+$/, `数字以外を含むコード: ${code}`);
      }
    }
  });

  it("重複するコードがない", () => {
    const seen = new Set<string>();
    for (const [id, codes] of PUBLISHER_ISBN_CODES) {
      for (const code of codes) {
        assert.ok(!seen.has(code), `重複コード ${code} (id: ${id})`);
        seen.add(code);
      }
    }
  });
});
