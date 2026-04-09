import type { PublisherDeps } from "../../domain/publisher.js";
import type { EbookStore, DrmType } from "../../domain/book.js";
import type { HtmlDocument } from "../../ports/html-parser.js";

const DEFAULT_HEADERS = {
  "User-Agent": "techbook-mcp/0.1.0 (+https://github.com/zonuexe/techbook-mcp; bibliographic search bot)",
  "Accept": "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "ja,en;q=0.9",
};

export const CACHE_TTL_SECONDS = 3600; // 1時間

export async function fetchText(
  url: string,
  deps: PublisherDeps,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const cached = await deps.cache.get(url);
  if (cached !== null) return cached;

  const headers = extraHeaders
    ? { ...DEFAULT_HEADERS, ...extraHeaders }
    : DEFAULT_HEADERS;

  const response = await deps.http.get(url, { headers });
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  const text = await response.text();
  await deps.cache.set(url, text, CACHE_TTL_SECONDS);
  return text;
}

/** HTMLタグを除去する（gihyo APIのauthorフィールドのruby markup除去に使用） */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** "¥3,960" や "3,300円（税込）" などから整数値を取り出す */
export function parseJapanesePrice(text: string): number | undefined {
  const match = text.match(/[\d,]+/);
  if (!match) return undefined;
  return parseInt(match[0].replace(/,/g, ""), 10);
}

/** 相対URLを絶対URLに解決する */
export function resolveUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}

/**
 * HTMLテキストから Amazon ASIN を抽出する。
 * amazon.co.jp/dp/{ASIN}, /gp/product/{ASIN}, /o/ASIN/{ASIN} 形式に対応。
 */
export function extractAsin(html: string): string | undefined {
  const match = html.match(/amazon\.co\.jp\/(?:dp|gp\/product|o\/ASIN)\/([A-Z0-9]{10})/);
  return match?.[1];
}

// --- 電子書籍ストア分類 ---

interface StorePattern {
  pattern: RegExp;
  name: string;
  drm: DrmType;
}

const EBOOK_STORE_PATTERNS: StorePattern[] = [
  // DRM-free
  { pattern: /techbookfest\.org\/product\//, name: "技術書典", drm: "free" },
  { pattern: /oreilly\.co\.jp\/books\//, name: "オライリー・ジャパン", drm: "free" },
  { pattern: /gihyo\.jp\/dp\/ebook\//, name: "Gihyo Digital Publishing", drm: "social" },
  // ソーシャルDRM (購入時生成IDまたは購入者情報を透かし刻印、技術的制限なし)
  { pattern: /book\.mynavi\.jp\/manatee\//, name: "マナティ", drm: "social" },
  { pattern: /www\.lambdanote\.com\/products\//, name: "ラムダノート", drm: "social" },
  { pattern: /tatsu-zine\.com\/books\/(?!pub\/)/, name: "達人出版会", drm: "social" },
  // ソーシャルDRM (購入者情報透かし入りPDF、技術的制限なし)
  { pattern: /book\.impress\.co\.jp\/books\//, name: "インプレスブックス", drm: "social" },
  // DRM-attached
  { pattern: /saiensu\.co\.jp/, name: "サイエンス社", drm: "password_pdf" },
  { pattern: /amazon\.co\.jp/, name: "Kindle", drm: "drm" },
  { pattern: /kinokuniya\.co\.jp\/kinoppystore/, name: "Kinoppy", drm: "drm" },
  { pattern: /books\.rakuten\.co\.jp|rakuten\.kobo\.com|kobo\.com/, name: "楽天Kobo", drm: "drm" },
  { pattern: /booklive\.jp/, name: "BookLive", drm: "drm" },
  { pattern: /honto\.jp/, name: "honto", drm: "drm" },
  { pattern: /bookwalker\.jp/, name: "BOOK☆WALKER", drm: "drm" },
  { pattern: /ebookjapan\.yahoo\.co\.jp/, name: "eBookJapan", drm: "drm" },
  { pattern: /store\.line\.me/, name: "LINEマンガ", drm: "drm" },
];

/** URLから電子書籍ストア情報を返す。未知のストアは null。 */
export function classifyEbookStore(url: string): EbookStore | null {
  for (const { pattern, name, drm } of EBOOK_STORE_PATTERNS) {
    if (pattern.test(url)) {
      return { name, url, drm };
    }
  }
  return null;
}

/**
 * HTMLドキュメント内の全リンクを走査して電子書籍ストアを抽出する。
 * 同一ストアのURLが複数あれば最初の1件のみ返す。
 */
export function extractEbookStoresFromDoc(doc: HtmlDocument): EbookStore[] {
  const stores: EbookStore[] = [];
  const seenNames = new Set<string>();

  for (const link of doc.select("a[href]")) {
    const href = link.attr("href");
    if (!href) continue;

    const store = classifyEbookStore(href);
    if (store && !seenNames.has(store.name)) {
      seenNames.add(store.name);
      stores.push(store);
    }
  }

  return stores;
}
