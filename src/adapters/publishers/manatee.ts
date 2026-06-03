import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import type { HtmlDocument } from "../../ports/html-parser.js";
import { fetchText, parseJapanesePrice, resolveUrl, extractAsin } from "./base.js";

const BASE_URL = "https://book.mynavi.jp/manatee";
const BOOKS_URL = `${BASE_URL}/books/`;

/**
 * `.attribute li` 内の著者リンクを配列にする。
 * 各 <a> のテキストが著者名（役割は括弧内テキストで付記されているが名前は <a> 内）。
 */
function parseAuthors(doc: HtmlDocument): string[] {
  return doc
    .select(".attribute li a")
    .map(el => el.text().trim())
    .filter(Boolean);
}

export const manateeAdapter: PublisherAdapter = {
  id: "manatee",
  name: "マナティ",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${BOOKS_URL}?topics_keyword=${encodeURIComponent(word)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    // 書籍アイテムは <!-- item --> コメントで区切られた <li> 内
    for (const li of doc.select("ul.category_list li")) {
      const titleEl = li.find("dl.detail dt a")[0];
      if (!titleEl) continue;

      const title = titleEl.text().trim();
      if (!title) continue;

      const href = titleEl.attr("href");
      if (!href) continue;
      const bookUrl = href.startsWith("http") ? href : resolveUrl(BASE_URL, href);

      const priceText = li.find(".detail__price")[0]?.text().trim();
      const price = priceText ? parseJapanesePrice(priceText) : undefined;

      const imgEl = li.find(".image img")[0];
      const imgSrc = imgEl?.attr("src");
      const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

      results.push({
        title,
        authors: [],
        publisher: "マナティ",
        url: bookUrl,
        price,
        coverImageUrl,
        ebookStores: [{ name: "マナティ", url: bookUrl, drm: "social" }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const title = doc.selectOne("h1.title")?.text().trim() ?? "";

    // `.intro` の最初の <p> が出版社名
    const publisher = doc.selectOne(".intro p")?.text().trim() ?? "マナティ";

    const authors = parseAuthors(doc);

    // 購入形態テーブルの最初の行から価格取得
    const priceText = doc.selectOne("#item_selectlist table .price")?.text().trim();
    const price = priceText ? parseJapanesePrice(priceText) : undefined;

    // 表紙画像の alt 属性が "ISBN.jpg" 形式（例: "9784839984274.jpg"）
    const imgEl = doc.selectOne("div.item_meta_image img");
    const imgSrc = imgEl?.attr("src");
    const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;
    const imgAlt = imgEl?.attr("alt") ?? "";
    const isbn = imgAlt.replace(/\.jpg$/i, "").replace(/-/g, "") || undefined;

    // 発売日: "発売日：2024-03-22"
    const dateText = doc.selectOne("p.date")?.text().trim();
    const publishedAt = dateText?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? undefined;

    const descEl = doc.selectOne(".item_desc p:not(.date):not(.pages)");
    const description = descEl?.text().trim() || undefined;

    // Amazon 購入動線は公式の マイナビブックスEC(/ec/products/) ページにある。
    // manatee（電子直販）ページには Amazon リンクが無く EC 商品ページへの相互リンクのみ
    // のため、辿って ASIN を取得する。
    let asin = extractAsin(html);
    if (!asin) {
      const ecMatch = html.match(/https:\/\/book\.mynavi\.jp\/ec\/products\/detail\/id=\d+/);
      if (ecMatch) {
        try {
          asin = extractAsin(await fetchText(ecMatch[0], deps));
        } catch {
          // EC ページ取得失敗は無視（ASIN なしで返す）
        }
      }
    }

    return {
      title,
      authors,
      publisher,
      url,
      isbn,
      asin,
      price,
      publishedAt,
      description,
      coverImageUrl,
      ebookStores: [{ name: "マナティ", url, drm: "social" }],
    };
  },
};
