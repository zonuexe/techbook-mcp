import type { PublisherDeps } from "../domain/publisher.js";
import type { BookRecord } from "../domain/book.js";
import { fetchText } from "./publishers/base.js";

const OPENBD_API_URL = "https://api.openbd.jp/v1/get";

// --- 型定義 ---

interface OpenBDSummary {
  isbn: string;
  title: string;
  publisher: string;
  pubdate: string;   // "YYYYMMDD"
  cover: string;     // "https://cover.openbd.jp/{isbn}.jpg"
  author: string;
}

interface OpenBDTextContent {
  TextType: string;  // "02": 短い説明, "03": 説明文, "04": 目次
  ContentAudience: string;
  Text: string;
}

interface OpenBDPrice {
  PriceType: string;    // "03": 税込定価
  PriceAmount: string;
  CurrencyCode: string;
}

interface OpenBDHanmoto {
  isbn: string;
  storelink?: string;
  [key: string]: unknown;
}

export interface OpenBDEntry {
  summary: OpenBDSummary;
  hanmoto?: OpenBDHanmoto;
  onix: {
    CollateralDetail?: {
      TextContent?: OpenBDTextContent[];
    };
    ProductSupply?: {
      SupplyDetail?: {
        Price?: OpenBDPrice[];
      };
    };
  };
}

// --- ユーティリティ ---

function parsePubDate(pubdate: string): string | undefined {
  if (!pubdate || pubdate.length < 8) return undefined;
  return `${pubdate.slice(0, 4)}-${pubdate.slice(4, 6)}-${pubdate.slice(6, 8)}`;
}

function findTextByType(entry: OpenBDEntry, ...types: string[]): string | undefined {
  const texts = entry.onix.CollateralDetail?.TextContent;
  if (!texts) return undefined;
  for (const type of types) {
    const found = texts.find(t => t.TextType === type);
    if (found?.Text) return found.Text;
  }
  return undefined;
}

function getTaxIncludedPrice(entry: OpenBDEntry): number | undefined {
  const prices = entry.onix.ProductSupply?.SupplyDetail?.Price;
  if (!prices) return undefined;
  // PriceType "03" = 税込定価
  const price = prices.find(p => p.PriceType === "03");
  if (!price) return undefined;
  const amount = parseInt(price.PriceAmount, 10);
  return isNaN(amount) ? undefined : amount;
}

// --- 公開API ---

/**
 * openBD API から複数ISBNの書誌情報を一括取得する。
 * @returns ISBNをキーとするMapを返す。該当なし・取得失敗のISBNは含まれない。
 */
export async function fetchOpenBDBooks(
  isbns: string[],
  deps: PublisherDeps,
): Promise<Map<string, OpenBDEntry>> {
  if (isbns.length === 0) return new Map();

  const url = `${OPENBD_API_URL}?isbn=${isbns.join(",")}`;
  const text = await fetchText(url, deps);
  const data: (OpenBDEntry | null)[] = JSON.parse(text);

  const result = new Map<string, OpenBDEntry>();
  for (let i = 0; i < isbns.length; i++) {
    const entry = data[i];
    if (entry !== null && entry !== undefined) {
      result.set(isbns[i], entry);
    }
  }
  return result;
}

/**
 * openBD エントリを BookRecord に変換する。
 * 出版社サイトから取得できない場合のフォールバック用。
 * url には hanmoto.storelink を使用し、なければ openBD API URL を使用する。
 */
export function openBDEntryToBookRecord(entry: OpenBDEntry): BookRecord {
  const { summary } = entry;
  const storelink = entry.hanmoto?.storelink;

  const authors = summary.author
    ? summary.author.split(/[\/／、,，]/).map(a => a.trim()).filter(Boolean)
    : [];

  return {
    title: summary.title,
    authors,
    publisher: summary.publisher,
    isbn: summary.isbn,
    publishedAt: parsePubDate(summary.pubdate),
    url: storelink ?? `https://api.openbd.jp/v1/get?isbn=${summary.isbn}`,
    price: getTaxIncludedPrice(entry),
    coverImageUrl: summary.cover || undefined,
    description: findTextByType(entry, "03", "02"),
  };
}

/**
 * openBD の書誌情報で BookRecord の欠損フィールドを補完する。
 * 既存のフィールドは上書きしない。
 */
export function enrichWithOpenBD(book: BookRecord, entry: OpenBDEntry): BookRecord {
  return {
    ...book,
    publishedAt: book.publishedAt ?? parsePubDate(entry.summary.pubdate),
    price: book.price ?? getTaxIncludedPrice(entry),
    coverImageUrl: book.coverImageUrl ?? (entry.summary.cover || undefined),
    description: book.description ?? findTextByType(entry, "03", "02"),
  };
}
