import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText } from "./base.js";

const API_BASE = "https://www.googleapis.com/books/v1";
const INFO_BASE = "https://books.google.com";

interface GoogleVolume {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    infoLink?: string;
  };
  saleInfo?: {
    listPrice?: { amount: number; currencyCode: string };
  };
}

interface GoogleSearchResponse {
  totalItems: number;
  items?: GoogleVolume[];
}

function toHttps(url: string): string {
  return url.replace(/^http:\/\//, "https://");
}

function parsePublishedDate(raw: string): string {
  const parts = raw.split("-");
  if (parts.length >= 3) return raw.slice(0, 10);
  if (parts.length === 2) return `${parts[0]}-${parts[1]}-01`;
  return `${parts[0]}-01-01`;
}

function volumeToBookRecord(vol: GoogleVolume): BookRecord {
  const info = vol.volumeInfo;
  const isbn13 = info.industryIdentifiers?.find(id => id.type === "ISBN_13")?.identifier;
  const price = vol.saleInfo?.listPrice?.currencyCode === "JPY"
    ? Math.round(vol.saleInfo.listPrice.amount)
    : undefined;

  const url = toHttps(info.infoLink ?? `${INFO_BASE}/books?id=${vol.id}`);

  return {
    title: info.title,
    authors: info.authors ?? [],
    publisher: info.publisher ?? "",
    publishedAt: info.publishedDate ? parsePublishedDate(info.publishedDate) : undefined,
    isbn: isbn13,
    url,
    price,
    coverImageUrl: info.imageLinks?.thumbnail ? toHttps(info.imageLinks.thumbnail) : undefined,
    description: info.description,
  };
}

export function makeGoogleBooksAdapter(apiKey?: string): PublisherAdapter {
  // env アクセスはメソッド呼び出し時に遅延評価する。
  // モジュールロード時に読むと Deno が --allow-env なしで権限エラーになる。
  const resolveKey = () => apiKey ?? process.env.GOOGLE_BOOKS_API_KEY ?? "";

  return {
    id: "google-books",
    name: "Google Books",
    baseUrl: INFO_BASE,

    async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
      const key = resolveKey();
      if (!key) return [];

      const word = [query.title, query.author].filter(Boolean).join(" ");
      if (!word) return [];

      const limit = Math.min(query.limit ?? 10, 40);
      const params = new URLSearchParams({
        q: word,
        langRestrict: "ja",
        maxResults: String(limit),
        key,
      });
      const text = await fetchText(`${API_BASE}/volumes?${params}`, deps);
      const data: GoogleSearchResponse = JSON.parse(text);

      return (data.items ?? []).map(volumeToBookRecord);
    },

    async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
      const key = resolveKey();
      if (!key) throw new Error("GOOGLE_BOOKS_API_KEY が設定されていません");

      const idMatch = url.match(/[?&]id=([^&]+)/);
      if (!idMatch) throw new Error(`URLからボリュームIDを取得できません: ${url}`);

      const volumeId = idMatch[1];
      const text = await fetchText(`${API_BASE}/volumes/${volumeId}?key=${key}`, deps);
      const vol: GoogleVolume = JSON.parse(text);

      return volumeToBookRecord(vol);
    },
  };
}

export const googleBooksAdapter: PublisherAdapter = makeGoogleBooksAdapter();
