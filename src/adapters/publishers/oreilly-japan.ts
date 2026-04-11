import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, resolveUrl, parseJapaneseDateToISO, stripAuthorRole } from "./base.js";

const BASE_URL = "https://www.oreilly.co.jp";
const EBOOK_LIST_URL = `${BASE_URL}/ebook/`;

/**
 * "2026年04月03日" → "2026-04-03"
 * "2025-04-08" (content属性) はそのまま返す
 */
function parseOreillyDate(text: string): string | undefined {
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  return parseJapaneseDateToISO(text);
}

/**
 * 著者文字列をパースして配列に変換する。
 * 例: "Dan Vanderkam　著、今村 謙士　訳" → ["Dan Vanderkam", "今村 謙士"]
 */
function parseAuthors(text: string): string[] {
  return text.split(/[、,]/).map(stripAuthorRole).filter(Boolean);
}

export const oreillyJapanAdapter: PublisherAdapter = {
  id: "oreilly-japan",
  name: "オライリー・ジャパン",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    // 検索APIがないためタイトルでローカルフィルタリングする
    // 著者のみの検索は各書籍詳細ページを全取得しないと不可能なため非対応
    if (!query.title) return [];

    const keyword = query.title.toLowerCase();
    const limit = query.limit ?? 10;

    const html = await fetchText(EBOOK_LIST_URL, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];

    for (const row of doc.select(".ebookCatalog tbody tr")) {
      const titleEl = row.find("td.title a")[0];
      if (!titleEl) continue;

      const title = titleEl.text().trim();
      if (!title.toLowerCase().includes(keyword)) continue;

      const href = titleEl.attr("href");
      if (!href) continue;
      const url = resolveUrl(EBOOK_LIST_URL, href);

      const isbnRaw = row.find("td.isbn")[0]?.text().trim();
      const isbn = isbnRaw?.replace(/-/g, "");

      const priceText = row.find("td.price")[0]?.text().trim();
      const price = priceText ? parseJapanesePrice(priceText) : undefined;

      const dateText = row.find("td")[3]?.text().trim();
      const publishedAt = dateText ? parseOreillyDate(dateText) : undefined;

      const coverImageUrl = isbn
        ? `${BASE_URL}/books/images/picture_large${isbnRaw}.jpeg`
        : undefined;

      results.push({
        title,
        authors: [],
        publisher: "オライリー・ジャパン",
        url,
        isbn,
        price,
        publishedAt,
        coverImageUrl,
        ebookStores: [{ name: "オライリー・ジャパン", url, drm: "free" }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const titleMain = doc.selectOne("h1[itemprop='name']")?.text().trim() ?? "";
    const subTitle = doc.selectOne("p.sub_title")?.text()
      .replace(/^[\s\u3000―-]+/, "").trim();
    const title = subTitle ? `${titleMain} ―${subTitle}` : titleMain;

    const authorText = doc.selectOne("span[itemprop='author']")?.text().trim() ?? "";
    const authors = parseAuthors(authorText);

    const isbnRaw = doc.selectOne("dd[itemprop='isbn']")?.text().trim();
    const isbn = isbnRaw?.replace(/-/g, "");

    const publishedAt = doc.selectOne("dd[itemprop='datePublished']")?.attr("content")
      ?? undefined;

    const coverImageUrl = doc.selectOne("img.cover-photo")?.attr("src") ?? undefined;

    const description = doc.selectOne("p[itemprop='description']")?.text().trim()
      || undefined;

    // Ebook価格を取得: "Ebook" という option-name の次の div
    let price: number | undefined;
    for (const item of doc.select(".option-item")) {
      const name = item.find(".option-name")[0]?.text().trim();
      if (name === "Ebook") {
        const priceText = item.find("div")[1]?.text().trim();
        if (priceText) price = parseJapanesePrice(priceText);
        break;
      }
    }

    return {
      title,
      authors,
      publisher: "オライリー・ジャパン",
      url,
      isbn,
      price,
      publishedAt,
      description,
      coverImageUrl,
      ebookStores: [{ name: "オライリー・ジャパン", url, drm: "free" }],
    };
  },
};
