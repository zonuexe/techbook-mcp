import type { PublisherDeps } from "../../domain/publisher.js";

const DEFAULT_HEADERS = {
  "User-Agent": "techbook-mcp/0.1.0 (+https://github.com/zonuexe/techbook-mcp; bibliographic search bot)",
  "Accept": "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "ja,en;q=0.9",
};

export const CACHE_TTL_SECONDS = 3600; // 1時間

export async function fetchText(url: string, deps: PublisherDeps): Promise<string> {
  const cached = await deps.cache.get(url);
  if (cached !== null) return cached;

  const response = await deps.http.get(url, { headers: DEFAULT_HEADERS });
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
 * amazon.co.jp/dp/{ASIN} または amazon.co.jp/gp/product/{ASIN} 形式に対応。
 */
export function extractAsin(html: string): string | undefined {
  const match = html.match(/amazon\.co\.jp\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
  return match?.[1];
}
