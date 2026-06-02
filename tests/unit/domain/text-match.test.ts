import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeForMatch,
  titleMatchScore,
  authorMatchScore,
  matchScore,
} from "../../../src/domain/text-match.js";

describe("normalizeForMatch()", () => {
  it("全角英数を半角に統一する (NFKC)", () => {
    assert.strictEqual(normalizeForMatch("Ｒｕｓｔ入門"), "rust入門");
  });

  it("装飾括弧・区切り・空白を除去する", () => {
    assert.strictEqual(normalizeForMatch("【電子版】Go言語 ― 入門"), "電子版go言語入門");
  });

  it("長音・ダッシュのゆれを吸収する", () => {
    assert.strictEqual(normalizeForMatch("データ―ベース"), normalizeForMatch("データベース"));
  });
});

describe("titleMatchScore()", () => {
  it("正規化後に一致すれば 1", () => {
    assert.strictEqual(titleMatchScore("Ｒｕｓｔ入門", "Rust入門"), 1);
  });

  it("部分一致は 0.5〜1 の範囲で長さ比に応じて割り引く", () => {
    const score = titleMatchScore("Rust", "実践Rustプログラミング入門");
    assert.ok(score > 0.5 && score < 1, `score=${score}`);
  });

  it("装飾マーカー付きでも高いスコアで一致する", () => {
    // "go言語入門"(6) が "電子版go言語入門"(9) に包含 → 0.5 + 0.5*(6/9) ≈ 0.83
    assert.ok(titleMatchScore("Go言語入門", "【電子版】Go言語入門") > 0.8);
  });

  it("無関係なら 0", () => {
    assert.strictEqual(titleMatchScore("Python", "Rust入門"), 0);
  });
});

describe("authorMatchScore()", () => {
  it("候補リスト中の最良一致を採用する", () => {
    assert.strictEqual(authorMatchScore("山田太郎", ["鈴木一郎", "山田太郎"]), 1);
  });

  it("一致なしなら 0", () => {
    assert.strictEqual(authorMatchScore("田中", ["鈴木一郎", "山田太郎"]), 0);
  });
});

describe("matchScore()", () => {
  const book = {
    title: "実践Rustプログラミング入門",
    authors: ["山口聖弘", "吉川哲史"],
    publisher: "秀和システム",
    url: "https://example.com/1",
  };

  it("title と author 両方指定なら平均を取る", () => {
    const titleOnly = matchScore({ title: "実践Rustプログラミング入門" }, book);
    const both = matchScore({ title: "実践Rustプログラミング入門", author: "山口聖弘" }, book);
    assert.strictEqual(titleOnly, 1);
    assert.strictEqual(both, 1);
  });

  it("title のみ指定ならその一致度を返す", () => {
    assert.strictEqual(matchScore({ title: "実践Rustプログラミング入門" }, book), 1);
  });

  it("title も author も未指定なら 0", () => {
    assert.strictEqual(matchScore({}, book), 0);
  });
});
