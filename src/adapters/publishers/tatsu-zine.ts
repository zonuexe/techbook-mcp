import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery, EbookStore } from "../../domain/book.js";
import type { HtmlDocument } from "../../ports/html-parser.js";
import { fetchText, parseJapanesePrice, resolveUrl } from "./base.js";

const BASE_URL = "https://tatsu-zine.com";

/**
 * "Vlad Khononov(著), 島田 浩二(訳)" → ["Vlad Khononov", "島田 浩二"]
 * 末尾の役割記号 (著)(訳)(監修)(編著) などを除去する。
 */
function parseAuthors(text: string): string[] {
  return text
    .split(/[,、]\s*/)
    .map(part => part.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim())
    .filter(Boolean);
}

/**
 * ページネーションリンクから最終ページ番号を取得する。
 * <a class="btn-pagination" href="/books?page=11">最後へ</a>
 */
function detectLastPage(doc: HtmlDocument): number {
  let max = 1;
  for (const a of doc.select("a.btn-pagination")) {
    const href = a.attr("href") ?? "";
    const m = href.match(/[?&]page=(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/**
 * "3,300円 (3,000円+税)" → 3300
 * 最初の数値が税込価格。
 */
function parsePrice(text: string): number | undefined {
  const match = text.match(/^([\d,]+)円/);
  if (match) return parseInt(match[1].replace(/,/g, ""), 10);
  return parseJapanesePrice(text);
}


export const tatsuZineAdapter: PublisherAdapter = {
  id: "tatsu-zine",
  name: "達人出版会",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    // 検索APIがないため書籍一覧からローカルフィルタリングする
    // 著者のみの検索は非対応
    if (!query.title) return [];

    const titleKeyword = query.title.toLowerCase();
    const authorKeyword = query.author?.toLowerCase();
    const limit = query.limit ?? 10;

    // 書籍一覧ページ: <article class="book"> が各書籍アイテム、ページネーションあり
    const firstHtml = await fetchText(`${BASE_URL}/books/`, deps);
    const firstDoc = deps.parser.parse(firstHtml);
    const lastPage = detectLastPage(firstDoc);

    const results: BookRecord[] = [];
    const docs = [[firstHtml, firstDoc] as const];

    // ページ2以降を先行して取得しておく（キャッシュ経由）
    for (let page = 2; page <= lastPage; page++) {
      const html = await fetchText(`${BASE_URL}/books?page=${page}`, deps);
      docs.push([html, deps.parser.parse(html)]);
    }

    outer: for (const [, doc] of docs) {
      for (const article of doc.select("article.book")) {
        const titleEl = article.find("h3[itemprop='name'] a")[0];
        if (!titleEl) continue;

        const title = titleEl.text().trim();
        if (!title.toLowerCase().includes(titleKeyword)) continue;

        const authorText = article.find("p[itemprop='author']")[0]?.text().trim() ?? "";
        if (authorKeyword && !authorText.toLowerCase().includes(authorKeyword)) continue;

        const href = titleEl.attr("href");
        if (!href) continue;
        const bookUrl = resolveUrl(BASE_URL, href);

        const authors = authorText ? parseAuthors(authorText) : [];

        results.push({
          title,
          authors,
          publisher: "達人出版会",
          url: bookUrl,
          // 達人出版会は全書籍で購入者情報を各ページに印字 (ソーシャルDRM)
          ebookStores: [{ name: "達人出版会", url: bookUrl, drm: "social" }],
        });

        if (results.length >= limit) break outer;
      }
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const title = doc.selectOne("h1")?.text().trim() ?? "";

    // 実際の出版社: <a href="/books/pub/{slug}">出版社名</a>
    // 達人出版会が刊行している場合はこのリンクが存在しない場合もある
    const publisherEl = doc.selectOne("a[href*='/books/pub/']");
    const publisher = publisherEl?.text().trim() || "達人出版会";

    // カバー画像
    const imgEl = doc.selectOne("img[src*='/images/books/']");
    const imgSrc = imgEl?.attr("src");
    const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

    // 著者・価格: dl > dd 構造を優先し、なければ p 要素を走査
    let authors: string[] = [];
    let price: number | undefined;

    const candidates = [
      ...doc.select("dd"),
      ...doc.select("p"),
    ];

    for (const el of candidates) {
      const text = el.text().trim();
      if (!authors.length && /[（(][著訳監編]/.test(text)) {
        authors = parseAuthors(text);
      }
      if (price === undefined && /^\d/.test(text) && /円/.test(text)) {
        price = parsePrice(text);
      }
      if (authors.length && price !== undefined) break;
    }

    // 達人出版会は全書籍で購入者情報を各ページに印字 (ソーシャルDRM)
    const ebookStores: EbookStore[] = [{ name: "達人出版会", url, drm: "social" }];

    return {
      title,
      authors,
      publisher,
      url,
      price,
      coverImageUrl,
      ebookStores,
    };
  },
};
