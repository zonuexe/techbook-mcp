import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, stripHtmlTags, resolveUrl } from "./base.js";

const BASE_URL = "https://gihyo.jp";

// --- API レスポンス型 ---

interface GihyoSearchResponse {
  lname: string;
  total: number;
  list: Record<string, GihyoBookEntry>;
  next: boolean;
  query: string;
}

interface GihyoBookEntry {
  series: string;
  title: string;
  subtitle: string;
  /** キー: 役割 ("著", "監修" など)、値: { 著者名: markup } */
  author: Record<string, Record<string, string>>;
  /** [定価, 割引価格] */
  price: [number, number];
  stock: number;
  /** ["YYYY.M.D", ""] */
  release: [string, string];
  /** 相対URL: "/book/YYYY/978-4-..." */
  url: string;
  upcoming: boolean;
  support: boolean;
  /** [thumb_url, width, height, full_url] */
  cover: [string, number, number, string];
}

// --- 変換ヘルパー ---

function parseAuthors(authorField: Record<string, Record<string, string>>): string[] {
  return Object.values(authorField).flatMap(roleEntries =>
    Object.keys(roleEntries).map(name => stripHtmlTags(name).trim()),
  );
}

function parseReleaseDate(release: [string, string]): string | undefined {
  const raw = release[0];
  if (!raw) return undefined;
  // "2025.9.29" → "2025-09-29"
  const parts = raw.split(".");
  if (parts.length !== 3) return raw;
  const [y, m, d] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function entryToBookRecord(isbn: string, entry: GihyoBookEntry): BookRecord {
  const title = entry.subtitle
    ? `${entry.title} ${entry.subtitle}`
    : entry.title;

  return {
    title,
    authors: parseAuthors(entry.author),
    publisher: "技術評論社",
    publishedAt: parseReleaseDate(entry.release),
    isbn: isbn.replace(/-/g, ""),
    url: resolveUrl(BASE_URL, entry.url),
    price: entry.price[0] > 0 ? entry.price[0] : undefined,
    coverImageUrl: entry.cover[3] ? resolveUrl(BASE_URL, entry.cover[3]) : undefined,
  };
}

// --- アダプター実装 ---

export const gihyoAdapter: PublisherAdapter = {
  id: "gihyo",
  name: "技術評論社",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const limit = query.limit ?? 10;
    const url = `${BASE_URL}/api_gh/site/search?search=${encodeURIComponent(word)}&limit=${limit}`;
    const text = await fetchText(url, deps);
    const data: GihyoSearchResponse = JSON.parse(text);

    return Object.entries(data.list).map(([isbn, entry]) => entryToBookRecord(isbn, entry));
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    // URL例: https://gihyo.jp/book/2022/978-4-297-12815-2
    const isbnMatch = url.match(/\/(978-[\d-]+)\s*$/);
    if (!isbnMatch) throw new Error(`URLからISBNを取得できません: ${url}`);

    const isbn = isbnMatch[1];
    const searchUrl = `${BASE_URL}/api_gh/site/search?search=${encodeURIComponent(isbn)}&limit=1`;
    const text = await fetchText(searchUrl, deps);
    const data: GihyoSearchResponse = JSON.parse(text);

    const entry = data.list[isbn];
    if (!entry) throw new Error(`書籍が見つかりません: ${isbn}`);

    return entryToBookRecord(isbn, entry);
  },
};
