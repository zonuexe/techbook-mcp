import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import type { HtmlElement } from "../../ports/html-parser.js";
import { fetchText, resolveUrl } from "./base.js";

// 海外のセルフパブリッシング・プラットフォーム Leanpub（DRM-free PDF/EPUB）
const BASE_URL = "https://leanpub.com";
const STORE_URL = `${BASE_URL}/store`;

const PUBLISHER = "Leanpub";
const STORE_NAME = "Leanpub";
const STORE_DRM = "free" as const;

// ストアカードの書影は CloudFront 上の {slug}/s_featured 画像
const COVER_RE = /cloudfront\.net\/([a-zA-Z0-9_-]+)\/s_featured/;

/** "Alice Smith and Bob Jones" → ["Alice Smith", "Bob Jones"] */
function parseAuthors(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\s*,\s*|\s+and\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
}

/** ストアカードの <li> から書誌情報を組み立てる。書籍カードでなければ null */
function parseCard(li: HtmlElement): BookRecord | null {
  const coverSrc = li.find("img")[0]?.attr("src");
  const m = coverSrc?.match(COVER_RE);
  if (!m) return null; // 書影がない = ナビ等の <li>
  const slug = m[1];
  const bookUrl = `${BASE_URL}/${slug}`;

  // タイトルリンク（同一 href の書影リンクが別にあり得るのでテキストありを選ぶ）
  const titleEl = li.find(`a[href="/${slug}"]`).find(a => a.text().trim().length > 0);
  const title = titleEl?.text().trim();
  if (!title) return null;

  const authors = parseAuthors(li.find(".text-neutral-500")[0]?.text());
  const description = li.find(".italic")[0]?.text().trim() || undefined;

  return {
    title,
    authors,
    publisher: PUBLISHER,
    url: bookUrl,
    description,
    coverImageUrl: coverSrc,
    ebookStores: [{ name: STORE_NAME, url: bookUrl, drm: STORE_DRM }],
  };
}

export const leanpubAdapter: PublisherAdapter = {
  id: "leanpub",
  name: "Leanpub",
  baseUrl: BASE_URL,
  language: "en",

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${STORE_URL}?search=${encodeURIComponent(word)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const li of doc.select("li")) {
      const book = parseCard(li);
      if (!book) continue;
      results.push(book);
      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const meta = (selector: string): string | undefined =>
      doc.selectOne(selector)?.attr("content")?.trim() || undefined;

    const title = meta('meta[property="og:title"]') ?? "";
    const authors = parseAuthors(meta('meta[name="author"]'));
    const description = meta('meta[property="og:description"]');
    const coverImageUrl = meta('meta[property="og:image"]');

    // 価格・更新日は埋め込み React Router ストリームから取得（静的HTMLの表示テキストは
    // CDN/SSR 状態で揺れるため不安定。ストリームのデータは安定して存在する）
    const priceMatch = html.match(/minimumPaidPrice\\",([\d.]+)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;

    const dateMatch = html.match(/lastPublishedAt\\",\\"(\d{4}-\d{2}-\d{2})/);
    const publishedAt = dateMatch?.[1];

    return {
      title,
      authors,
      publisher: PUBLISHER,
      url,
      price,
      currency: price !== undefined ? "USD" : undefined,
      publishedAt,
      coverImageUrl,
      description,
      ebookStores: [{ name: STORE_NAME, url, drm: STORE_DRM }],
    };
  },
};
