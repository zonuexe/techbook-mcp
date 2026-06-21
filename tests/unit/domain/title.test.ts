import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collapseWhitespace, parseBibliographicTitle } from "../../../src/domain/title.js";

describe("collapseWhitespace()", () => {
  it("生改行・連続空白を単一スペースに畳んで trim する", () => {
    assert.strictEqual(
      collapseWhitespace("図解即戦力\nWeb技術がこれ1冊でしっかりわかる教科書"),
      "図解即戦力 Web技術がこれ1冊でしっかりわかる教科書",
    );
    assert.strictEqual(collapseWhitespace("  a\t b\n\n c  "), "a b c");
  });
});

describe("parseBibliographicTitle()", () => {
  it("区切りが無ければ title のみ（副題・並列タイトルは付かない）", () => {
    assert.deepStrictEqual(parseBibliographicTitle("型システムのしくみ"), {
      title: "型システムのしくみ",
    });
  });

  it("' : ' で副題を分離する", () => {
    assert.deepStrictEqual(
      parseBibliographicTitle("正規表現技術入門 : 最新エンジン実装と理論的背景"),
      { title: "正規表現技術入門", subtitle: "最新エンジン実装と理論的背景" },
    );
  });

  it("' = ' で並列タイトルを分離する", () => {
    assert.deepStrictEqual(
      parseBibliographicTitle("リーダブルコード = The Art of Readable Code"),
      { title: "リーダブルコード", alternativeTitle: "The Art of Readable Code" },
    );
  });

  it("ISBD 順 '本タイトル = 並列 : 副題' を3要素に分解する", () => {
    assert.deepStrictEqual(
      parseBibliographicTitle(
        "エンジニアリング組織論への招待 = Engineering Organization Theory : 不確実性に向き合う",
      ),
      {
        title: "エンジニアリング組織論への招待",
        subtitle: "不確実性に向き合う",
        alternativeTitle: "Engineering Organization Theory",
      },
    );
  });

  it("書名内の区切り文字（スペースを伴わないコロン等）は誤分割しない", () => {
    assert.deepStrictEqual(parseBibliographicTitle("OAuth 2.0をはじめよう"), {
      title: "OAuth 2.0をはじめよう",
    });
  });

  it("分離前に空白を畳む", () => {
    assert.deepStrictEqual(
      parseBibliographicTitle("本タイトル\n : 副題"),
      { title: "本タイトル", subtitle: "副題" },
    );
  });
});
