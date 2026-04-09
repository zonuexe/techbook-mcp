import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery, EbookStore } from "../../domain/book.js";
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
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    // 検索フォーム: <form method="get" action="/books/"><input name="search">
    const url = `${BASE_URL}/books/?search=${encodeURIComponent(word)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    // 書籍アイテムのHTML構造:
    //   <a href="/books/{slug}"><img src="/images/books/{id}/cover_s.jpg" alt="Title"></a>
    //   <h3><a href="/books/{slug}">Title</a></h3>
    //   <p>Author(著), ...</p>
    //
    // タイトルリンクと著者段落を位置で対応付ける
    const titleLinks = doc.select("h3 a[href]").filter(a => {
      const href = a.attr("href") ?? "";
      return href.startsWith("/books/") && !href.startsWith("/books/pub/");
    });
    const authorParagraphs = doc.select("h3 + p");

    const results: BookRecord[] = [];

    for (let i = 0; i < titleLinks.length; i++) {
      const titleLink = titleLinks[i];
      const title = titleLink.text().trim();
      const href = titleLink.attr("href");
      if (!title || !href) continue;

      const bookUrl = resolveUrl(BASE_URL, href);
      const authorText = authorParagraphs[i]?.text().trim() ?? "";
      const authors = authorText ? parseAuthors(authorText) : [];

      results.push({
        title,
        authors,
        publisher: "達人出版会",
        url: bookUrl,
        // 達人出版会は全書籍で購入者情報を各ページに印字 (ソーシャルDRM)
        ebookStores: [{ name: "達人出版会", url: bookUrl, drm: "social" }],
      });
    }

    return results.slice(0, query.limit ?? 10);
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
