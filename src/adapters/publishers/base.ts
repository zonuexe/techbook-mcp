import iconv from "iconv-lite";
import type { PublisherDeps } from "../../domain/publisher.js";
import type { EbookStore, DrmType } from "../../domain/book.js";
import type { HtmlDocument } from "../../ports/html-parser.js";

const DEFAULT_HEADERS = {
  "User-Agent": "techbook-mcp/0.1.0 (+https://github.com/zonuexe/techbook-mcp; bibliographic search bot)",
  "Accept": "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "ja,en;q=0.9",
};

export const CACHE_TTL_SECONDS = 3600; // 1時間
export const ROBOTS_CACHE_TTL_SECONDS = 6 * 3600; // 6時間

// --- robots.txt チェック ---

/** robots.txt の1ルール */
interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}

/** robots.txt のユーザーエージェントセクション */
interface RobotsSection {
  agents: string[];
  rules: RobotsRule[];
}

/** robots.txt をパースしてセクション一覧を返す */
function parseRobotsTxt(content: string): RobotsSection[] {
  const sections: RobotsSection[] = [];
  let current: RobotsSection | null = null;
  let inAgentBlock = true;

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmedRaw = rawLine.trim();
    // 空行（コメント行ではない）のみセクションをリセット
    if (!trimmedRaw || trimmedRaw.startsWith("#")) {
      if (!trimmedRaw) {
        current = null;
        inAgentBlock = true;
      }
      continue;
    }

    const line = trimmedRaw.split("#")[0].trim();
    if (!line) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      if (inAgentBlock && current !== null) {
        // 同じセクションに複数のUser-agent行
        current.agents.push(value.toLowerCase());
      } else {
        // 新しいセクション開始
        current = { agents: [value.toLowerCase()], rules: [] };
        sections.push(current);
        inAgentBlock = true;
      }
    } else if (current !== null && (key === "allow" || key === "disallow")) {
      inAgentBlock = false;
      current.rules.push({ type: key, path: value });
    }
  }

  return sections;
}

/** 指定ユーザーエージェントに適用されるルールを返す（固有エージェント優先、なければ * にフォールバック） */
function getRulesForAgent(sections: RobotsSection[], agentToken: string): RobotsRule[] {
  const lower = agentToken.toLowerCase();

  for (const section of sections) {
    if (section.agents.includes(lower)) return section.rules;
  }
  for (const section of sections) {
    if (section.agents.includes("*")) return section.rules;
  }
  return [];
}

/** パスがルール一覧で許可されているか判定する（最長プレフィックス一致） */
function isPathAllowed(path: string, rules: RobotsRule[]): boolean {
  let bestMatch = { length: -1, allowed: true };

  for (const rule of rules) {
    if (!rule.path) continue; // 空の Disallow は「全許可」を意味するが不一致として扱う

    if (path.startsWith(rule.path) && rule.path.length > bestMatch.length) {
      bestMatch = { length: rule.path.length, allowed: rule.type === "allow" };
    }
  }

  return bestMatch.allowed;
}

/**
 * 指定URLのオリジンの robots.txt を取得してアクセス可否を返す。
 * 取得結果は6時間キャッシュする。エラー時はアクセスを許可する（fail-open）。
 */
export async function checkRobotsTxt(url: string, deps: PublisherDeps): Promise<boolean> {
  const parsed = new URL(url);
  const origin = `${parsed.protocol}//${parsed.host}`;
  const cacheKey = `robots:${origin}`;

  let content: string;
  const cached = await deps.cache.get(cacheKey);

  if (cached !== null) {
    content = cached;
  } else {
    try {
      const response = await deps.http.get(`${origin}/robots.txt`, { headers: DEFAULT_HEADERS });
      content = response.status === 200 ? await response.text() : "";
    } catch {
      // robots.txt 取得失敗時はアクセスを許可する
      content = "";
    }
    await deps.cache.set(cacheKey, content, ROBOTS_CACHE_TTL_SECONDS);
  }

  if (!content) return true;

  const sections = parseRobotsTxt(content);
  const rules = getRulesForAgent(sections, "techbook-mcp");
  return isPathAllowed(parsed.pathname + parsed.search, rules);
}

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

/**
 * キーワードを EUC-JP でパーセントエンコードする。
 * born-digital・rutles など EUC-JP エンコードのみ受け付けるサイト向け。
 */
export function encodeEucJp(text: string): string {
  const bytes = iconv.encode(text, "euc-jp");
  return Array.from(bytes)
    .map(b => "%" + b.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

/**
 * "2026年3月25日" → "2026-03-25"
 * 1桁の月・日も対応する。
 */
export function parseJapaneseDateToISO(text: string): string | undefined {
  const m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/**
 * 著者名末尾の役割語（著・訳・編・監修・監訳など）を除去して名前だけを返す。
 * 例: "Dan Vanderkam　著" → "Dan Vanderkam"
 */
export function stripAuthorRole(name: string): string {
  return name.replace(/[\u3000\s]*(著|訳|編|監修|監訳|著訳|著・訳|他)[\u3000\s]*$/, "").trim();
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
  { pattern: /shop\.rutles\.net\//, name: "ラトルズ", drm: "free" },
  { pattern: /peaks\.cc\/books\//, name: "PEAKS", drm: "free" },
  { pattern: /optronics-ebook\.com\/products\//, name: "オプトロニクス社", drm: "free" },
  { pattern: /gihyo\.jp\/dp\/ebook\//, name: "Gihyo Digital Publishing", drm: "social" },
  { pattern: /seshop\.com\/product\//, name: "SEshop", drm: "social" },
  { pattern: /book-tech\.com\/books\//, name: "BOOK TECH", drm: "social" },
  { pattern: /wgn-obs\.shop-pro\.jp\/\?pid=/, name: "ボーンデジタル", drm: "social" },
  { pattern: /cc\.cqpub\.co\.jp\/lib\/system\/doclib_item\//, name: "CQ出版 Tech Village", drm: "social" },
  // ソーシャルDRM (購入時生成IDまたは購入者情報を透かし刻印、技術的制限なし)
  { pattern: /book\.mynavi\.jp\/manatee\//, name: "マナティ", drm: "social" },
  { pattern: /www\.lambdanote\.com\/products\//, name: "ラムダノート", drm: "social" },
  { pattern: /tatsu-zine\.com\/books\/(?!pub\/)/, name: "達人出版会", drm: "social" },
  // ソーシャルDRM (購入者情報透かし入りPDF、技術的制限なし)
  { pattern: /book\.impress\.co\.jp\/books\//, name: "インプレスブックス", drm: "social" },
  // DRM-attached
  { pattern: /saiensu\.co\.jp/, name: "サイエンス社", drm: "password_pdf" },
  { pattern: /amazon\.co\.jp/, name: "Kindle", drm: "drm" },
  { pattern: /kinokuniya\.co\.jp\/(?:kinoppystore|f\/dsg-08)/, name: "Kinoppy", drm: "drm" },
  { pattern: /coop-ebook\.jp\/mem\//, name: "VarsityWave eBooks", drm: "drm" },
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
