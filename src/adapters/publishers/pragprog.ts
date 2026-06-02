import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, resolveUrl } from "./base.js";

// 米国の技術書出版社 The Pragmatic Bookshelf（DRM-free PDF/epub/mobi）
const BASE_URL = "https://pragprog.com";
// クライアントサイド検索（lunr.js）が読み込む全書籍インデックス
const INDEX_URL = `${BASE_URL}/search/index.json`;

const PUBLISHER = "Pragmatic Bookshelf";
const STORE_NAME = "Pragmatic Bookshelf";
// PDF/epub/mobi を全フォーマット提供、技術的DRMなし
const STORE_DRM = "free" as const;

/** /search/index.json の1レコード（record_type で book / errata を区別） */
interface IndexRecord {
  record_type: string;
  href: string;
  title: string;
  subtitle?: string;
  author?: string;
  keywords?: string[];
  code?: string;
  image?: string;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "Published: July 2026" → "2026-07-01"（月精度のため日は01固定） */
function parsePublishedDate(text: string): string | undefined {
  const m = text.match(/Published:\s*([A-Za-z]+)\s+(\d{4})/);
  if (!m) return undefined;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return undefined;
  return `${m[2]}-${String(month).padStart(2, "0")}-01`;
}

/**
 * "Dmitry Zinoviev with Paul Gries, Jennifer Campbell, and Jason Montojo"
 *   → ["Dmitry Zinoviev", "Paul Gries", "Jennifer Campbell", "Jason Montojo"]
 */
function parseAuthors(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\s*,\s*|\s+with\s+|\s+and\s+/i)
    // オックスフォードカンマ "..., and X" はカンマ優先で分割され "and X" が残るため接続詞を除去
    .map(s => s.trim().replace(/^(?:and|with)\s+/i, "").trim())
    .filter(Boolean);
}

/** ".buybox" のテキストから USD 価格を取り出す。"$39.95 (USD)" → 39.95 */
function parseUsdPrice(text: string): number | undefined {
  const m = text.match(/\$\s*([\d,]+\.\d{2})/);
  if (!m) return undefined;
  return parseFloat(m[1].replace(/,/g, ""));
}

export const pragprogAdapter: PublisherAdapter = {
  id: "pragprog",
  name: "Pragmatic Bookshelf",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const titleQ = query.title?.trim().toLowerCase();
    const authorQ = query.author?.trim().toLowerCase();
    if (!titleQ && !authorQ) return [];

    const json = await fetchText(INDEX_URL, deps);
    const data = JSON.parse(json) as { results?: IndexRecord[] };
    const records = data.results ?? [];

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const rec of records) {
      if (rec.record_type !== "book") continue;

      const haystack = [rec.title, rec.subtitle, (rec.keywords ?? []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const authorStr = (rec.author ?? "").toLowerCase();

      // タイトル語は全トークン一致、著者は部分一致（AND 条件）
      if (titleQ && !titleQ.split(/\s+/).every(tok => haystack.includes(tok))) continue;
      if (authorQ && !authorStr.includes(authorQ)) continue;

      const bookUrl = resolveUrl(BASE_URL, rec.href);

      results.push({
        title: rec.title.trim(),
        authors: parseAuthors(rec.author),
        publisher: PUBLISHER,
        url: bookUrl,
        description: rec.subtitle?.trim() || undefined,
        coverImageUrl: rec.image ? resolveUrl(BASE_URL, rec.image) : undefined,
        ebookStores: [{ name: STORE_NAME, url: bookUrl, drm: STORE_DRM }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const metaContent = (selector: string): string | undefined =>
      doc.selectOne(selector)?.attr("content")?.trim() || undefined;

    const title =
      doc.selectOne("h1.title")?.text().trim() ||
      metaContent('meta[property="og:title"]') ||
      "";

    const authors = parseAuthors(
      metaContent('meta[property="book:author"]') ??
        doc.selectOne("h2.author")?.text().replace(/^by\s+/i, ""),
    );

    const isbn = metaContent('meta[property="book:isbn"]');

    const description =
      metaContent('meta[property="og:description"]') ||
      doc.selectOne("h2.subtitle")?.text().trim() ||
      undefined;

    const coverImageUrl = metaContent('meta[property="og:image"]');

    const aboutText = doc.selectOne(".book-about-text")?.text() ?? "";
    const publishedAt = parsePublishedDate(aboutText);

    const buyboxText = doc.selectOne(".buybox")?.text() ?? "";
    const price = parseUsdPrice(buyboxText);

    return {
      title,
      authors,
      publisher: PUBLISHER,
      url,
      isbn,
      price,
      currency: price !== undefined ? "USD" : undefined,
      publishedAt,
      coverImageUrl,
      description,
      ebookStores: [{ name: STORE_NAME, url, drm: STORE_DRM }],
    };
  },
};
