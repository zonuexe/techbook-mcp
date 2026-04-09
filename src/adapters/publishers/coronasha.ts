import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import type { HtmlElement } from "../../ports/html-parser.js";
import { fetchText, parseJapanesePrice, resolveUrl, extractEbookStoresFromDoc } from "./base.js";

const BASE_URL = "https://www.coronasha.co.jp";
const SEARCH_URL = `${BASE_URL}/np/result.html`;

/** "2023/05/01" → "2023-05-01" */
function parseDate(text: string): string | undefined {
  const m = text.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * `.tunogaki` と `.book-title` からタイトルを組み立てる。
 * "1から始める" + "Juliaプログラミング" → "1から始める Juliaプログラミング"
 */
function buildTitle(container: HtmlElement): string {
  const tunogaki = container.find(".tunogaki")[0]?.text().trim();
  const bookTitle = container.find(".book-title")[0]?.text().trim() ?? "";
  return tunogaki ? `${tunogaki} ${bookTitle}` : bookTitle;
}

/**
 * `dl` 要素の配列から `dt` をキー、`dd` をバリューとするマップを返す。
 * 価格・ISBN・発行年月日などの取得に使う。
 */
function parseDlMap(dls: HtmlElement[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const dl of dls) {
    const key = dl.find("dt")[0]?.text().trim();
    const val = dl.find("dd")[0]?.text().trim();
    if (key && val) map.set(key, val);
  }
  return map;
}

export const coronashaAdapter: PublisherAdapter = {
  id: "coronasha",
  name: "コロナ社",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${SEARCH_URL}?q=${encodeURIComponent(word)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const item of doc.select("article.item")) {
      // 電子版があるものだけ対象
      const hasEbook = item.find("ul.status-list li")
        .some(el => el.text().trim() === "電子版あり");
      if (!hasEbook) continue;

      const linkEl = item.find("dl.col1 dt a")[0];
      const href = linkEl?.attr("href");
      if (!href) continue;
      const bookUrl = resolveUrl(BASE_URL, href);

      const title = buildTitle(item);
      if (!title) continue;

      const authors = item.find("ul.authors li a")
        .map(el => el.text().trim())
        .filter(Boolean);

      const info = parseDlMap(item.find(".book-info dl"));
      const price = parseJapanesePrice(info.get("定価") ?? "");
      const publishedAt = parseDate(info.get("発行年月日") ?? "");
      const isbn = info.get("ISBN")?.replace(/-/g, "") || undefined;

      const imgEl = item.find("img.cover")[0];
      const coverSrc = imgEl?.attr("src");
      const coverImageUrl = coverSrc ? resolveUrl(BASE_URL, coverSrc) : undefined;

      results.push({
        title,
        authors,
        publisher: "コロナ社",
        url: bookUrl,
        isbn,
        price,
        publishedAt,
        coverImageUrl,
        ebookStores: [],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const h2 = doc.selectOne("h2.title");
    const title = h2 ? buildTitle(h2) : "";

    const authors = doc.select("ul.authors li a")
      .map(el => el.text().trim())
      .filter(Boolean);

    const info = parseDlMap(doc.select(".book-info dl"));
    const publishedAt = parseDate(info.get("発行年月日") ?? "");
    const isbn = info.get("ISBN")?.replace(/-/g, "") || undefined;

    // 価格はサイドバーの .price に表示される（book-info dl には含まれない）
    const priceText = doc.selectOne(".price")?.text();
    const price = priceText ? parseJapanesePrice(priceText) : undefined;

    const imgEl = doc.selectOne("img.cover");
    const coverSrc = imgEl?.attr("src");
    const coverImageUrl = coverSrc ? resolveUrl(BASE_URL, coverSrc) : undefined;

    // 電子版購入ポップアップのリンクから電子書籍ストアを自動検出
    const ebookStores = extractEbookStoresFromDoc(doc);

    return {
      title,
      authors,
      publisher: "コロナ社",
      url,
      isbn,
      price,
      publishedAt,
      coverImageUrl,
      ebookStores,
    };
  },
};
