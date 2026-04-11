import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, parseJapaneseDateToISO, stripAuthorRole } from "./base.js";

const BASE_URL = "https://www.saiensu.co.jp";
const SEARCH_URL = `${BASE_URL}/search/`;

/**
 * "堀井俊佑(早稲田大学准教授)　監修" → "堀井俊佑"
 * 所属（括弧内）と役割語を除去する。
 */
function parseAuthorName(text: string): string {
  return stripAuthorRole(text.replace(/\(.*?\)/g, ""));
}

/** "ISBN：978-4-7819-9049-1" → "9784781990491" */
function parseIsbn(text: string): string | undefined {
  const m = text.match(/[\d-]{13,}/);
  return m ? m[0].replace(/-/g, "") : undefined;
}

/** "発行：サイエンス社" → "サイエンス社" */
function parsePublisher(text: string): string {
  return text.replace(/^発行[：:]/, "").trim();
}

export const saiensuAdapter: PublisherAdapter = {
  id: "saiensu",
  name: "サイエンス社",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${SEARCH_URL}?keyword=${encodeURIComponent(word)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const article of doc.select("article.bookListItem")) {
      // 電子書籍のみを対象とする
      const mediaName = article.find(".bookListItemData_mediaName")[0]?.text().trim();
      if (mediaName !== "電子") continue;

      const titleEl = article.find("h4.bookListItemData_title p.minor-mt a.link_item")[0];
      if (!titleEl) continue;

      const title = titleEl.text().trim();
      const href = titleEl.attr("href");
      if (!title || !href) continue;

      const subtitle = article.find("small.bookListItemData_subtitle")[0]?.text().trim();
      const fullTitle = subtitle ? `${title} ―${subtitle}` : title;

      const authorText = article.find(".bookListItemData_author a.link_item")
        .map(el => parseAuthorName(el.text()))
        .filter(Boolean);

      const priceText = article.find(".bookListItemData_priceIncludedTaxNumber")[0]?.text().trim();
      const price = priceText ? parseJapanesePrice(priceText) : undefined;

      const dateText = article.find(".bookListItemData_publishDate")[0]?.text().trim();
      const publishedAt = dateText ? parseJapaneseDateToISO(dateText) : undefined;

      const publisherText = article.find(".bookListItemData_publisher")[0]?.text().trim();
      const publisher = publisherText ? parsePublisher(publisherText) : "サイエンス社";

      const isbnText = article.find(".bookListItemData_isbn2")[0]?.text().trim();
      const isbn = isbnText ? parseIsbn(isbnText) : undefined;

      const imgEl = article.find(".bookListItemCover img")[0];
      const coverImageUrl = imgEl?.attr("src") ?? undefined;

      const bookUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      results.push({
        title: fullTitle,
        authors: authorText,
        publisher,
        url: bookUrl,
        isbn,
        price,
        publishedAt,
        coverImageUrl,
        // パスワード認証付きPDF販売。標準PDFビューアで閲覧可能だが技術的制限あり
        ebookStores: [{ name: "サイエンス社", url: bookUrl, drm: "password_pdf" }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const titleMain = doc.selectOne("h2.mainDetail_bookTitle")?.text().trim() ?? "";
    const subtitle = doc.selectOne(".mainDetail_subTitle")?.text().trim();
    const title = subtitle ? `${titleMain} ―${subtitle}` : titleMain;

    const authors = doc.select(".mainDetail_authorList a.link_item")
      .map(el => parseAuthorName(el.text()))
      .filter(Boolean);

    const priceText = doc.selectOne(".price_num")?.text().trim();
    const price = priceText ? parseJapanesePrice(priceText) : undefined;

    const dateText = doc.selectOne(".bookDetail_publishDate")?.text().trim();
    const publishedAt = dateText ? parseJapaneseDateToISO(dateText) : undefined;

    const publisherText = doc.selectOne(".bookDetail_publisher")?.text().trim();
    const publisher = publisherText ? parsePublisher(publisherText) : "サイエンス社";

    const isbnText = doc.selectOne(".bookDetail_isbn")?.text().trim();
    const isbn = isbnText ? parseIsbn(isbnText) : undefined;

    const coverImageUrl = doc.selectOne("img.mainDetail_bookImage")?.attr("src") ?? undefined;

    return {
      title,
      authors,
      publisher,
      url,
      isbn,
      price,
      publishedAt,
      coverImageUrl,
      ebookStores: [{ name: "サイエンス社", url, drm: "password_pdf" }],
    };
  },
};
