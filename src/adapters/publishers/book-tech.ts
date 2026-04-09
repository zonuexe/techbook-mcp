import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, resolveUrl } from "./base.js";

const BASE_URL = "https://book-tech.com";
const SEARCH_URL = `${BASE_URL}/books`;
// クエリパラメータキー（URLエンコード済み）
const SEARCH_PARAM = "q%5Btitle_or_overview_or_identification_number_1_or_product_code_cont%5D";

/** "2026/2/20" → "2026-02-20" */
function parseDate(text: string): string | undefined {
  const m = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** "(著)" などの役割語を末尾から除去する */
function stripRole(name: string): string {
  return name.replace(/\s*[（(][^)）]*[)）]\s*$/, "").trim();
}

export const bookTechAdapter: PublisherAdapter = {
  id: "book-tech",
  name: "BOOK TECH",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${SEARCH_URL}?${SEARCH_PARAM}=${encodeURIComponent(word)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const item of doc.select("div.contents-index-item")) {
      const linkEl = item.find("a.book-ribbon-link")[0];
      const href = linkEl?.attr("href");
      if (!href) continue;
      const bookUrl = resolveUrl(BASE_URL, href);

      const title = item.find(".contents-index-item-detail-title")[0]?.text().trim();
      if (!title) continue;

      const publisherEl = item.find("a[href*='publisher_relations']")[0];
      const publisher = publisherEl?.text().trim() ?? "";

      const authors = item.find("a[href*='author_relations']")
        .map(el => stripRole(el.text().trim()))
        .filter(Boolean);

      const priceText = item.find(".contents-index-item-detail-price_include_tax")[0]?.text();
      const price = priceText ? parseJapanesePrice(priceText) : undefined;

      const dateText = item.find(".my-1")[0]?.text();
      const publishedAt = dateText ? parseDate(dateText) : undefined;

      const imgEl = item.find("img.thumb")[0];
      const coverImageUrl = imgEl?.attr("src") ?? undefined;

      results.push({
        title,
        authors,
        publisher,
        url: bookUrl,
        price,
        publishedAt,
        coverImageUrl,
        ebookStores: [{ name: "BOOK TECH", url: bookUrl, drm: "social" }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const title = doc.selectOne(".contents-book-about-title h1")?.text().trim() ?? "";

    const publisherEl = doc.selectOne("a[href*='publisher_relations']");
    const publisher = publisherEl?.text().trim() ?? "";

    const authors = doc.select("a[href*='author_relations']")
      .map(el => stripRole(el.text().trim()))
      .filter(Boolean);

    const priceText = doc.selectOne(".contents-book-item-detail-price_include_tax")?.text();
    const price = priceText ? parseJapanesePrice(priceText) : undefined;

    const dateText = doc.selectOne(".contents-book-about-publicationdate")?.text();
    const publishedAt = dateText ? parseDate(dateText) : undefined;

    const isbnText = doc.selectOne(".contents-book-about-id")?.text();
    const isbn = isbnText?.match(/\d{13}/)?.[0];

    const imgEl = doc.selectOne("img.thumb");
    const coverImageUrl = imgEl?.attr("src") ?? undefined;

    return {
      title,
      authors,
      publisher,
      url,
      isbn,
      price,
      publishedAt,
      coverImageUrl,
      ebookStores: [{ name: "BOOK TECH", url, drm: "social" }],
    };
  },
};
