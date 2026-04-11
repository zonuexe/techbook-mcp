import { describe, it, expect } from "vitest";
import {
  parseJapanesePrice,
  stripHtmlTags,
  resolveUrl,
  extractAsin,
  classifyEbookStore,
  extractEbookStoresFromDoc,
  fetchText,
} from "../../../src/adapters/publishers/base.js";
import { MockHttpClient } from "../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../src/adapters/cache/null-cache.js";
import { MemoryCacheStore } from "../../../src/adapters/cache/memory-cache.js";

function makeDeps(http: MockHttpClient, cache = new NullCacheStore()) {
  return { http, parser: new CheerioHtmlParser(), cache };
}

// --- parseJapanesePrice ---

describe("parseJapanesePrice()", () => {
  it("カンマ区切りの円表記をパースする", () => {
    expect(parseJapanesePrice("3,960円（税込）")).toBe(3960);
  });

  it("¥記号付きをパースする", () => {
    expect(parseJapanesePrice("¥3,960")).toBe(3960);
  });

  it("カンマなし整数をパースする", () => {
    expect(parseJapanesePrice("1980円")).toBe(1980);
  });

  it("数字がなければ undefined を返す", () => {
    expect(parseJapanesePrice("価格未定")).toBeUndefined();
  });
});

// --- stripHtmlTags ---

describe("stripHtmlTags()", () => {
  it("HTMLタグを除去してテキストを返す", () => {
    expect(stripHtmlTags("<b>太字</b>テキスト")).toBe("太字テキスト");
  });

  it("ruby タグを除去する（rt の中身は残る）", () => {
    // タグを除去するだけなので <rt> 内のテキストは残る
    expect(stripHtmlTags("<ruby>著者<rt>ちょしゃ</rt></ruby>名")).toBe("著者ちょしゃ名");
  });

  it("タグがなければそのまま返す", () => {
    expect(stripHtmlTags("プレーンテキスト")).toBe("プレーンテキスト");
  });

  it("空文字列はそのまま", () => {
    expect(stripHtmlTags("")).toBe("");
  });
});

// --- resolveUrl ---

describe("resolveUrl()", () => {
  it("相対パスを絶対URLに変換する", () => {
    expect(resolveUrl("https://example.com/books/", "../detail/1"))
      .toBe("https://example.com/detail/1");
  });

  it("絶対URLはそのまま返す", () => {
    expect(resolveUrl("https://example.com/", "https://other.com/page"))
      .toBe("https://other.com/page");
  });

  it("ルート相対パスを解決する", () => {
    expect(resolveUrl("https://example.com/books/123", "/about"))
      .toBe("https://example.com/about");
  });
});

// --- extractAsin ---

describe("extractAsin()", () => {
  it("/dp/ 形式から ASIN を抽出する", () => {
    expect(extractAsin("https://www.amazon.co.jp/dp/4873119464"))
      .toBe("4873119464");
  });

  it("/gp/product/ 形式から ASIN を抽出する", () => {
    expect(extractAsin("https://www.amazon.co.jp/gp/product/4873119464"))
      .toBe("4873119464");
  });

  it("Amazon URL でなければ undefined を返す", () => {
    expect(extractAsin("https://example.com/books/123")).toBeUndefined();
  });

  it("ASIN を含まなければ undefined を返す", () => {
    expect(extractAsin("https://www.amazon.co.jp/")).toBeUndefined();
  });
});

// --- classifyEbookStore ---

describe("classifyEbookStore()", () => {
  it("技術書典URLは free を返す", () => {
    const store = classifyEbookStore("https://techbookfest.org/product/abc123");
    expect(store).toMatchObject({ name: "技術書典", drm: "free" });
  });

  it("Kindle URLは drm を返す", () => {
    const store = classifyEbookStore("https://www.amazon.co.jp/dp/B0XXXXX");
    expect(store).toMatchObject({ name: "Kindle", drm: "drm" });
  });

  it("サイエンス社は password_pdf を返す", () => {
    const store = classifyEbookStore("https://www.saiensu.co.jp/search/?isbn=978-4-7819-1234-5&y=2024#book");
    expect(store).toMatchObject({ name: "サイエンス社", drm: "password_pdf" });
  });

  it("SEshop URLは social を返す", () => {
    const store = classifyEbookStore("https://www.seshop.com/product/detail/12345");
    expect(store).toMatchObject({ name: "SEshop", drm: "social" });
  });

  it("未知のURLは null を返す", () => {
    expect(classifyEbookStore("https://unknown-store.example.com/book/1")).toBeNull();
  });

  it("URLを store.url に格納する", () => {
    const url = "https://techbookfest.org/product/abc123";
    expect(classifyEbookStore(url)?.url).toBe(url);
  });
});

// --- extractEbookStoresFromDoc ---

describe("extractEbookStoresFromDoc()", () => {
  const parser = new CheerioHtmlParser();

  it("ページ内のストアリンクを抽出する", () => {
    const html = `<html><body>
      <a href="https://techbookfest.org/product/abc">技術書典</a>
      <a href="https://www.amazon.co.jp/dp/B0XXXXX">Kindle</a>
    </body></html>`;
    const doc = parser.parse(html);
    const stores = extractEbookStoresFromDoc(doc);
    expect(stores).toHaveLength(2);
    expect(stores[0]).toMatchObject({ name: "技術書典", drm: "free" });
    expect(stores[1]).toMatchObject({ name: "Kindle", drm: "drm" });
  });

  it("同一ストアのURLが複数あれば最初の1件のみ返す", () => {
    const html = `<html><body>
      <a href="https://www.amazon.co.jp/dp/B0AAAAA">Kindle A</a>
      <a href="https://www.amazon.co.jp/dp/B0BBBBB">Kindle B</a>
    </body></html>`;
    const doc = parser.parse(html);
    const stores = extractEbookStoresFromDoc(doc);
    expect(stores).toHaveLength(1);
    expect(stores[0].url).toBe("https://www.amazon.co.jp/dp/B0AAAAA");
  });

  it("既知ストアへのリンクがなければ空配列を返す", () => {
    const html = `<html><body><a href="https://example.com/">不明</a></body></html>`;
    const doc = parser.parse(html);
    expect(extractEbookStoresFromDoc(doc)).toEqual([]);
  });

  it("href を持たない a 要素は無視する", () => {
    const html = `<html><body><a>リンクなし</a></body></html>`;
    const doc = parser.parse(html);
    expect(extractEbookStoresFromDoc(doc)).toEqual([]);
  });
});

// --- fetchText ---

describe("fetchText()", () => {
  it("HTTPレスポンスのテキストを返す", async () => {
    const http = new MockHttpClient().addResponse(
      "https://example.com/page",
      { status: 200, body: "<html>hello</html>" },
    );
    const result = await fetchText("https://example.com/page", makeDeps(http));
    expect(result).toBe("<html>hello</html>");
  });

  it("200以外はエラーをスローする", async () => {
    const http = new MockHttpClient().addResponse(
      "https://example.com/page",
      { status: 404, body: "Not Found" },
    );
    await expect(fetchText("https://example.com/page", makeDeps(http)))
      .rejects.toThrow("HTTP 404");
  });

  it("キャッシュヒット時はHTTPを呼ばない", async () => {
    const cache = new MemoryCacheStore();
    await cache.set("https://example.com/page", "<html>cached</html>", 3600);

    const http = new MockHttpClient();
    const result = await fetchText("https://example.com/page", makeDeps(http, cache));

    expect(result).toBe("<html>cached</html>");
    expect(http.calls).toHaveLength(0);
  });

  it("取得結果をキャッシュに保存する", async () => {
    const cache = new MemoryCacheStore();
    const http = new MockHttpClient().addResponse(
      "https://example.com/page",
      { status: 200, body: "<html>fresh</html>" },
    );

    await fetchText("https://example.com/page", makeDeps(http, cache));
    const cached = await cache.get("https://example.com/page");
    expect(cached).toBe("<html>fresh</html>");
  });

  it("extraHeaders をリクエストに含める", async () => {
    // MockHttpClient は headers を直接検査できないが、HTTPが正常に呼ばれることを確認
    const http = new MockHttpClient().addResponse(
      "https://example.com/page",
      { status: 200, body: "ok" },
    );
    const result = await fetchText(
      "https://example.com/page",
      makeDeps(http),
      { Referer: "https://example.com/" },
    );
    expect(result).toBe("ok");
    expect(http.calls).toHaveLength(1);
  });
});
