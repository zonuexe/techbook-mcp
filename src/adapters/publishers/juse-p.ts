import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, resolveUrl } from "./base.js";

const BASE_URL = "https://www.juse-p.co.jp";
const SEARCH_URL = `${BASE_URL}/products`;

/**
 * "武藤佳恭[監修]、和田尚之[著]" → ["武藤佳恭", "和田尚之"]
 * 著者テキストから役割語（[著][監修]等）を除去して名前リストを返す。
 */
function parseAuthors(text: string): string[] {
  return text.split(/[、，]/)
    .map(s => s.replace(/\[.*?\]/g, "").trim())
    .filter(Boolean);
}

/** "ISBN978-4-8171-9818-1" → "9784817198181" */
function parseIsbn(text: string): string | undefined {
  const m = text.match(/[\d-]{13,}/);
  return m ? m[0].replace(/-/g, "") : undefined;
}

/**
 * h2.c-ttl-02 のテキストから書籍名とサブタイトルを取り出す。
 * 【カテゴリラベル】は除外する。
 * 例: "【コレクション】\n\tPython入門\n\t機械学習の基礎" → ["Python入門", "機械学習の基礎"]
 */
function parseTitleParts(text: string): string[] {
  return text
    .split(/\n/)
    .map(s => s.trim())
    .filter(s => s && !/^【.*】$/.test(s));
}

export const jusePAdapter: PublisherAdapter = {
  id: "juse-p",
  name: "日科技連出版社",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const keyword = [query.title, query.author].filter(Boolean).join(" ");
    if (!keyword) return [];

    const url = `${SEARCH_URL}?k=${encodeURIComponent(keyword)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const item of doc.select(".product-col")) {
      const linkEl = item.find("div.title h4 a")[0];
      const href = linkEl?.attr("href");
      if (!href) continue;

      const title = linkEl.text().trim();
      if (!title) continue;

      const bookUrl = resolveUrl(BASE_URL, href);

      const imgEl = item.find("div.image img")[0];
      const coverSrc = imgEl?.attr("src");
      const coverImageUrl = coverSrc ? resolveUrl(BASE_URL, coverSrc) : undefined;

      results.push({
        title,
        authors: [],
        publisher: "日科技連出版社",
        url: bookUrl,
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

    // h2.c-ttl-02 に【カテゴリ】・書籍名・サブタイトルが <br> 区切りで入る
    const h2 = doc.selectOne("h2.c-ttl-02");
    const titleParts = parseTitleParts(h2?.text() ?? "");
    const title = titleParts.join(" ");

    // .product-details ul li をパターンで分類
    const lis = doc.select(".product-details ul li");
    let authors: string[] = [];
    let price: number | undefined;
    let isbn: string | undefined;

    for (const li of lis) {
      const text = li.text();
      if (text.startsWith("定価")) {
        price = parseJapanesePrice(text);
      } else if (text.startsWith("ISBN")) {
        isbn = parseIsbn(text);
      } else if (/^[A-Z][0-9]／/.test(text) || /在庫|品切/.test(text)) {
        // 判型・ページ数 または 在庫状況 → スキップ
      } else if (authors.length === 0) {
        authors = parseAuthors(text);
      }
    }

    const imgEl = doc.selectOne(".images-block img");
    const coverSrc = imgEl?.attr("src");
    const coverImageUrl = coverSrc ? resolveUrl(BASE_URL, coverSrc) : undefined;

    return {
      title,
      authors,
      publisher: "日科技連出版社",
      url,
      isbn,
      price,
      coverImageUrl,
      // Amazon・楽天等のリンクは紙書籍向けのため電子書籍ストアとして扱わない
      ebookStores: [],
    };
  },
};
