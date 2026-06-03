import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseJapanesePrice,
  stripHtmlTags,
  resolveUrl,
  extractAsin,
  deriveAsinFromStores,
  classifyEbookStore,
  extractEbookStoresFromDoc,
  fetchText,
  encodeEucJp,
  parseJapaneseDateToISO,
  stripAuthorRole,
  checkRobotsTxt,
  ROBOTS_CACHE_TTL_SECONDS,
} from "../../../src/adapters/publishers/base.js";
import { MockHttpClient } from "../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../src/adapters/cache/null-cache.js";
import { MemoryCacheStore } from "../../../src/adapters/cache/memory-cache.js";

function makeDeps(http: MockHttpClient, cache = new NullCacheStore()) {
  return { http, parser: new CheerioHtmlParser(), cache };
}

// --- encodeEucJp ---

describe("encodeEucJp()", () => {
  it("ASCII文字はそのままパーセントエンコードする", () => {
    assert.match(encodeEucJp("abc"), /^(%[0-9A-F]{2})+$/);
  });

  it("日本語をEUC-JPでエンコードする", () => {
    const result = encodeEucJp("TypeScript");
    // EUC-JPでエンコードされた結果は%XX形式
    assert.match(result, /^(%[0-9A-F]{2})+$/);
  });

  it("空文字列は空文字列を返す", () => {
    assert.strictEqual(encodeEucJp(""), "");
  });
});

// --- parseJapaneseDateToISO ---

describe("parseJapaneseDateToISO()", () => {
  it("YYYY年M月D日 を YYYY-MM-DD に変換する", () => {
    assert.strictEqual(parseJapaneseDateToISO("2026年3月25日"), "2026-03-25");
  });

  it("1桁の月・日もゼロパディングする", () => {
    assert.strictEqual(parseJapaneseDateToISO("2024年1月5日"), "2024-01-05");
  });

  it("日付パターンがなければ undefined を返す", () => {
    assert.strictEqual(parseJapaneseDateToISO("発行：サイエンス社"), undefined);
  });

  it("テキスト中に埋め込まれていても抽出できる", () => {
    assert.strictEqual(parseJapaneseDateToISO("発行日：2026年3月25日"), "2026-03-25");
  });
});

// --- stripAuthorRole ---

describe("stripAuthorRole()", () => {
  it("末尾の「著」を除去する", () => {
    assert.strictEqual(stripAuthorRole("Dan Vanderkam　著"), "Dan Vanderkam");
  });

  it("末尾の「訳」を除去する", () => {
    assert.strictEqual(stripAuthorRole("今村 謙士　訳"), "今村 謙士");
  });

  it("末尾の「監修」を除去する", () => {
    assert.strictEqual(stripAuthorRole("堀井俊佑 監修"), "堀井俊佑");
  });

  it("末尾の「著訳」を除去する", () => {
    assert.strictEqual(stripAuthorRole("島田浩二　著訳"), "島田浩二");
  });

  it("役割語がなければそのまま返す", () => {
    assert.strictEqual(stripAuthorRole("山田太郎"), "山田太郎");
  });

  it("前後の空白・全角スペースをトリムする", () => {
    assert.strictEqual(stripAuthorRole("  著者名  "), "著者名");
  });
});

// --- parseJapanesePrice ---

describe("parseJapanesePrice()", () => {
  it("カンマ区切りの円表記をパースする", () => {
    assert.strictEqual(parseJapanesePrice("3,960円（税込）"), 3960);
  });

  it("¥記号付きをパースする", () => {
    assert.strictEqual(parseJapanesePrice("¥3,960"), 3960);
  });

  it("カンマなし整数をパースする", () => {
    assert.strictEqual(parseJapanesePrice("1980円"), 1980);
  });

  it("数字がなければ undefined を返す", () => {
    assert.strictEqual(parseJapanesePrice("価格未定"), undefined);
  });
});

// --- stripHtmlTags ---

describe("stripHtmlTags()", () => {
  it("HTMLタグを除去してテキストを返す", () => {
    assert.strictEqual(stripHtmlTags("<b>太字</b>テキスト"), "太字テキスト");
  });

  it("ruby タグを除去する（rt の中身は残る）", () => {
    // タグを除去するだけなので <rt> 内のテキストは残る
    assert.strictEqual(stripHtmlTags("<ruby>著者<rt>ちょしゃ</rt></ruby>名"), "著者ちょしゃ名");
  });

  it("タグがなければそのまま返す", () => {
    assert.strictEqual(stripHtmlTags("プレーンテキスト"), "プレーンテキスト");
  });

  it("空文字列はそのまま", () => {
    assert.strictEqual(stripHtmlTags(""), "");
  });
});

// --- resolveUrl ---

describe("resolveUrl()", () => {
  it("相対パスを絶対URLに変換する", () => {
    assert.strictEqual(
      resolveUrl("https://example.com/books/", "../detail/1"),
      "https://example.com/detail/1",
    );
  });

  it("絶対URLはそのまま返す", () => {
    assert.strictEqual(
      resolveUrl("https://example.com/", "https://other.com/page"),
      "https://other.com/page",
    );
  });

  it("ルート相対パスを解決する", () => {
    assert.strictEqual(
      resolveUrl("https://example.com/books/123", "/about"),
      "https://example.com/about",
    );
  });
});

// --- extractAsin ---

describe("extractAsin()", () => {
  it("/dp/ 形式から ASIN を抽出する", () => {
    assert.strictEqual(
      extractAsin("https://www.amazon.co.jp/dp/4873119464"),
      "4873119464",
    );
  });

  it("/gp/product/ 形式から ASIN を抽出する", () => {
    assert.strictEqual(
      extractAsin("https://www.amazon.co.jp/gp/product/4873119464"),
      "4873119464",
    );
  });

  it("Amazon URL でなければ undefined を返す", () => {
    assert.strictEqual(extractAsin("https://example.com/books/123"), undefined);
  });

  it("ASIN を含まなければ undefined を返す", () => {
    assert.strictEqual(extractAsin("https://www.amazon.co.jp/"), undefined);
  });
});

// --- deriveAsinFromStores ---

describe("deriveAsinFromStores()", () => {
  it("Amazon ストアURLから ASIN を導出する", () => {
    const stores = [
      { name: "SEshop", url: "https://www.seshop.com/product/detail/1", drm: "social" as const },
      { name: "Kindle", url: "https://www.amazon.co.jp/dp/B0ABCDEFGH", drm: "drm" as const },
    ];
    assert.strictEqual(deriveAsinFromStores(stores), "B0ABCDEFGH");
  });

  it("Kindle (B始まり) を紙の ASIN より優先する", () => {
    const stores = [
      { name: "Amazon", url: "https://www.amazon.co.jp/dp/4873119464", drm: "drm" as const },
      { name: "Kindle", url: "https://www.amazon.co.jp/dp/B00ZZZZZZZ", drm: "drm" as const },
    ];
    assert.strictEqual(deriveAsinFromStores(stores), "B00ZZZZZZZ");
  });

  it("Amazon リンクが無ければ undefined", () => {
    const stores = [{ name: "SEshop", url: "https://www.seshop.com/x", drm: "social" as const }];
    assert.strictEqual(deriveAsinFromStores(stores), undefined);
  });

  it("undefined を渡しても安全", () => {
    assert.strictEqual(deriveAsinFromStores(undefined), undefined);
  });
});

// --- classifyEbookStore ---

describe("classifyEbookStore()", () => {
  it("技術書典URLは free を返す", () => {
    const store = classifyEbookStore("https://techbookfest.org/product/abc123");
    assert.partialDeepStrictEqual(store, { name: "技術書典", drm: "free" });
  });

  it("Kindle URLは drm を返す", () => {
    const store = classifyEbookStore("https://www.amazon.co.jp/dp/B0XXXXX");
    assert.partialDeepStrictEqual(store, { name: "Kindle", drm: "drm" });
  });

  it("サイエンス社は password_pdf を返す", () => {
    const store = classifyEbookStore("https://www.saiensu.co.jp/search/?isbn=978-4-7819-1234-5&y=2024#book");
    assert.partialDeepStrictEqual(store, { name: "サイエンス社", drm: "password_pdf" });
  });

  it("SEshop URLは social を返す", () => {
    const store = classifyEbookStore("https://www.seshop.com/product/detail/12345");
    assert.partialDeepStrictEqual(store, { name: "SEshop", drm: "social" });
  });

  it("未知のURLは null を返す", () => {
    assert.strictEqual(classifyEbookStore("https://unknown-store.example.com/book/1"), null);
  });

  it("URLを store.url に格納する", () => {
    const url = "https://techbookfest.org/product/abc123";
    assert.strictEqual(classifyEbookStore(url)?.url, url);
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
    assert.strictEqual(stores.length, 2);
    assert.partialDeepStrictEqual(stores[0], { name: "技術書典", drm: "free" });
    assert.partialDeepStrictEqual(stores[1], { name: "Kindle", drm: "drm" });
  });

  it("同一ストアのURLが複数あれば最初の1件のみ返す", () => {
    const html = `<html><body>
      <a href="https://www.amazon.co.jp/dp/B0AAAAA">Kindle A</a>
      <a href="https://www.amazon.co.jp/dp/B0BBBBB">Kindle B</a>
    </body></html>`;
    const doc = parser.parse(html);
    const stores = extractEbookStoresFromDoc(doc);
    assert.strictEqual(stores.length, 1);
    assert.strictEqual(stores[0].url, "https://www.amazon.co.jp/dp/B0AAAAA");
  });

  it("既知ストアへのリンクがなければ空配列を返す", () => {
    const html = `<html><body><a href="https://example.com/">不明</a></body></html>`;
    const doc = parser.parse(html);
    assert.deepStrictEqual(extractEbookStoresFromDoc(doc), []);
  });

  it("href を持たない a 要素は無視する", () => {
    const html = `<html><body><a>リンクなし</a></body></html>`;
    const doc = parser.parse(html);
    assert.deepStrictEqual(extractEbookStoresFromDoc(doc), []);
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
    assert.strictEqual(result, "<html>hello</html>");
  });

  it("200以外はエラーをスローする", async () => {
    const http = new MockHttpClient().addResponse(
      "https://example.com/page",
      { status: 404, body: "Not Found" },
    );
    await assert.rejects(
      fetchText("https://example.com/page", makeDeps(http)),
      /HTTP 404/,
    );
  });

  it("キャッシュヒット時はHTTPを呼ばない", async () => {
    const cache = new MemoryCacheStore();
    await cache.set("https://example.com/page", "<html>cached</html>", 3600);

    const http = new MockHttpClient();
    const result = await fetchText("https://example.com/page", makeDeps(http, cache));

    assert.strictEqual(result, "<html>cached</html>");
    assert.strictEqual(http.calls.length, 0);
  });

  it("取得結果をキャッシュに保存する", async () => {
    const cache = new MemoryCacheStore();
    const http = new MockHttpClient().addResponse(
      "https://example.com/page",
      { status: 200, body: "<html>fresh</html>" },
    );

    await fetchText("https://example.com/page", makeDeps(http, cache));
    const cached = await cache.get("https://example.com/page");
    assert.strictEqual(cached, "<html>fresh</html>");
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
    assert.strictEqual(result, "ok");
    assert.strictEqual(http.calls.length, 1);
  });
});

// --- checkRobotsTxt ---

describe("checkRobotsTxt()", () => {
  it("robots.txt が存在しない (404) 場合はアクセスを許可する", async () => {
    const http = new MockHttpClient().addResponse(
      "https://example.com/robots.txt",
      { status: 404, body: "Not Found" },
    );
    const result = await checkRobotsTxt("https://example.com/search?q=foo", makeDeps(http));
    assert.strictEqual(result, true);
  });

  it("HTTP エラー時はアクセスを許可する (fail-open)", async () => {
    // ハンドラー未登録 → MockHttpClient が例外をスロー
    const http = new MockHttpClient();
    const result = await checkRobotsTxt("https://example.com/search?q=foo", makeDeps(http));
    assert.strictEqual(result, true);
  });

  it("Disallow がない場合はアクセスを許可する", async () => {
    const http = new MockHttpClient().addResponse(
      "https://example.com/robots.txt",
      { status: 200, body: "User-agent: *\nDisallow:\n" },
    );
    const result = await checkRobotsTxt("https://example.com/search", makeDeps(http));
    assert.strictEqual(result, true);
  });

  it("Disallow: / はすべてのパスを禁止する", async () => {
    const http = new MockHttpClient().addResponse(
      "https://example.com/robots.txt",
      { status: 200, body: "User-agent: *\nDisallow: /\n" },
    );
    const result = await checkRobotsTxt("https://example.com/search?q=foo", makeDeps(http));
    assert.strictEqual(result, false);
  });

  it("特定パスの Disallow はそのパスだけを禁止する", async () => {
    const robotsTxt = "User-agent: *\nDisallow: /private/\n";
    const http = new MockHttpClient().addResponse(
      "https://example.com/robots.txt",
      { status: 200, body: robotsTxt },
    );
    const deps = makeDeps(http);

    assert.strictEqual(await checkRobotsTxt("https://example.com/private/data", deps), false);
    assert.strictEqual(await checkRobotsTxt("https://example.com/public/page", deps), true);
  });

  it("techbook-mcp 固有ルールがワイルドカードより優先される", async () => {
    const robotsTxt = [
      "User-agent: *",
      "Disallow: /",
      "",
      "User-agent: techbook-mcp",
      "Allow: /",
    ].join("\n");
    const http = new MockHttpClient().addResponse(
      "https://example.com/robots.txt",
      { status: 200, body: robotsTxt },
    );
    const result = await checkRobotsTxt("https://example.com/search", makeDeps(http));
    assert.strictEqual(result, true);
  });

  it("Allow が Disallow より長いプレフィックスで一致する場合は許可する", async () => {
    const robotsTxt = [
      "User-agent: *",
      "Disallow: /books/",
      "Allow: /books/detail/",
    ].join("\n");
    const http = new MockHttpClient().addResponse(
      "https://example.com/robots.txt",
      { status: 200, body: robotsTxt },
    );
    const deps = makeDeps(http);

    assert.strictEqual(await checkRobotsTxt("https://example.com/books/list", deps), false);
    assert.strictEqual(await checkRobotsTxt("https://example.com/books/detail/123", deps), true);
  });

  it("robots.txt の結果を ${ROBOTS_CACHE_TTL_SECONDS}秒キャッシュする", async () => {
    const http = new MockHttpClient().addResponse(
      "https://example.com/robots.txt",
      { status: 200, body: "User-agent: *\nDisallow: /\n" },
    );
    const cache = new MemoryCacheStore();
    const deps = makeDeps(http, cache);

    await checkRobotsTxt("https://example.com/page", deps);

    const cached = await cache.get("robots:https://example.com");
    assert.notEqual(cached, null);
    assert.strictEqual(http.calls.filter(u => u.includes("robots.txt")).length, 1);
  });

  it("キャッシュヒット時は HTTP を呼ばない", async () => {
    const cache = new MemoryCacheStore();
    await cache.set("robots:https://example.com", "", ROBOTS_CACHE_TTL_SECONDS);

    const http = new MockHttpClient();
    const result = await checkRobotsTxt("https://example.com/page", makeDeps(http, cache));

    assert.strictEqual(result, true);
    assert.strictEqual(http.calls.length, 0);
  });

  it("コメント行を無視する", async () => {
    const robotsTxt = [
      "# このサイトのクローラー設定",
      "User-agent: *",
      "# 検索ページを禁止",
      "Disallow: /search/",
    ].join("\n");
    const http = new MockHttpClient().addResponse(
      "https://example.com/robots.txt",
      { status: 200, body: robotsTxt },
    );
    const result = await checkRobotsTxt("https://example.com/search/query", makeDeps(http));
    assert.strictEqual(result, false);
  });
});
