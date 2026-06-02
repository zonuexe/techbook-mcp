import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, CATALOG_CACHE_TTL_SECONDS } from "./base.js";

const BASE_URL = "https://peaks.cc";

export const peaksAdapter: PublisherAdapter = {
  id: "peaks",
  name: "PEAKS",
  baseUrl: BASE_URL,
  scale: "minor",

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    // 検索APIなし。タイトルでトップページの全書籍をローカルフィルタリング。
    // 著者のみの検索は各詳細ページを全取得しないと不可能なため非対応。
    if (!query.title) return [];

    const keyword = query.title.toLowerCase();
    const html = await fetchText(BASE_URL, deps, undefined, CATALOG_CACHE_TTL_SECONDS);
    const doc = deps.parser.parse(html);
    const limit = query.limit ?? 10;

    const results: BookRecord[] = [];

    // トップページ掲載の全書籍: article.p-project__unit
    for (const article of doc.select("article.p-project__unit")) {
      const imgEl = article.find("div.p-project__unit_image img")[0];
      const title = imgEl?.attr("alt")?.trim();
      if (!title) continue;

      if (!title.toLowerCase().includes(keyword)) continue;

      const linkEl = article.find("div.p-project__unit_image a")[0];
      const href = linkEl?.attr("href");
      if (!href) continue;

      const bookUrl = `${BASE_URL}${href}`;
      const coverImageUrl = imgEl.attr("src") ?? undefined;

      results.push({
        title,
        authors: [],
        publisher: "PEAKS",
        url: bookUrl,
        coverImageUrl,
        ebookStores: [{ name: "PEAKS", url: bookUrl, drm: "free" }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const getMeta = (name: string, attr = "content"): string | undefined =>
      doc.selectOne(`meta[name="${name}"]`)?.attr(attr)?.trim() ||
      doc.selectOne(`meta[property="${name}"]`)?.attr("content")?.trim() ||
      undefined;

    // タイトル: twitter:title（『』なし）が最もクリーン
    const title =
      getMeta("twitter:title") ||
      doc.selectOne("h2.p-project__intro_title")?.text()
        .trim().replace(/^[『「]|[』」]$/g, "") ||
      "";

    // 著者: p-project__intro_author 内のリンクテキスト（末尾カンマを除去）
    const authors = doc.select("ul.p-project__intro_author a")
      .map(el => el.text().trim().replace(/,\s*$/, ""))
      .filter(Boolean);

    // 価格: 電子版 option の span テキスト
    const priceEl = doc.selectOne("option[kind='electronic'] span") ??
                    doc.selectOne("select#editions option");
    const price = priceEl
      ? parseJapanesePrice(priceEl.text())
      : undefined;

    // カバー画像: twitter:image または og:image
    const coverImageUrl =
      getMeta("twitter:image") ||
      getMeta("og:image") ||
      undefined;

    return {
      title,
      authors,
      publisher: "PEAKS",
      url,
      price,
      coverImageUrl,
      ebookStores: [{ name: "PEAKS", url, drm: "free" }],
    };
  },
};
