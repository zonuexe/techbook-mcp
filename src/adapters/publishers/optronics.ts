import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, resolveUrl } from "./base.js";

const BASE_URL = "https://optronics-ebook.com";
const LIST_URL = `${BASE_URL}/products/list.php`;

/** 電子書籍カテゴリID */
const EBOOK_CATEGORY_ID = "1";

/**
 * listcomment / main_comment のテキストから各フィールドを抽出する。
 * フォーマット例:
 *   "著者:波多腰 玄一\n発行:㈱オプトロニクス社\n頁数:384頁\n..."
 */
function parseComment(text: string): { authors: string[]; publisher?: string } {
  const authorMatch = text.match(/著者[：:]\s*([^\n<]+)/);
  const authors = authorMatch
    ? authorMatch[1].split(/[、,]/).map(s => s.trim()).filter(Boolean)
    : [];

  const publisherMatch = text.match(/発行[：:]\s*([^\n<]+)/);
  const publisher = publisherMatch
    ? publisherMatch[1].replace(/[㈱㈲]/g, "").trim() || undefined
    : undefined;

  return { authors, publisher };
}

export const optronicsAdapter: PublisherAdapter = {
  id: "optronics",
  name: "オプトロニクス社",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${LIST_URL}?name=${encodeURIComponent(word)}&category_id=${EBOOK_CATEGORY_ID}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const block of doc.select("div.list_area")) {
      const titleEl = block.find("div.listrightbloc h3 a")[0];
      if (!titleEl) continue;

      const title = titleEl.text().trim();
      const href = titleEl.attr("href");
      if (!title || !href) continue;

      const bookUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      const priceText = block.find("div.pricebox .price")[0]?.text().trim();
      const price = priceText ? parseJapanesePrice(priceText) : undefined;

      const commentText = block.find("div.listcomment")[0]?.text().trim() ?? "";
      const { authors, publisher } = parseComment(commentText);

      const imgEl = block.find("div.listphoto img.picture")[0];
      const imgSrc = imgEl?.attr("src");
      const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

      results.push({
        title,
        authors,
        publisher: publisher ?? "オプトロニクス社",
        url: bookUrl,
        price,
        coverImageUrl,
        ebookStores: [{ name: "オプトロニクス社", url: bookUrl, drm: "free" }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    // タイトル: <title>OPTRONICS eBOOK / {title}</title>
    const rawTitle = doc.selectOne("title")?.text().trim() ?? "";
    const title = rawTitle.replace(/^OPTRONICS\s+eBOOK\s*[/／]\s*/, "").trim();

    // 価格: #price02_default
    const priceText = doc.selectOne("#price02_default")?.text().trim();
    const price = priceText ? parseJapanesePrice(priceText) : undefined;

    // 著者・発行元: div.main_comment テキスト
    const commentText = doc.selectOne("div.main_comment")?.text().trim() ?? "";
    const { authors, publisher } = parseComment(commentText);

    // カバー画像: img.picture
    const imgEl = doc.selectOne("img.picture");
    const imgSrc = imgEl?.attr("src");
    const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

    return {
      title,
      authors,
      publisher: publisher ?? "オプトロニクス社",
      url,
      price,
      coverImageUrl,
      ebookStores: [{ name: "オプトロニクス社", url, drm: "free" }],
    };
  },
};
