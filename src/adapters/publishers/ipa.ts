import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import type { HtmlDocument } from "../../ports/html-parser.js";
import { normalizeIsbn } from "../../domain/isbn.js";
import {
  fetchText,
  parseJapanesePrice,
  parseJapaneseDateToISO,
  resolveUrl,
  CATALOG_CACHE_TTL_SECONDS,
} from "./base.js";

const BASE_URL = "https://www.ipa.go.jp";
const INDEX_URL = `${BASE_URL}/archive/publish/index.html`;
const PUBLISHER = "IPA";

interface CatalogEntry {
  title: string;
  url: string;
}

/** 末尾の全角スペース・空白を除去する（IPA の見出し・リンクは全角スペースで終わることが多い） */
function trimTitle(text: string): string {
  return text.replace(/[　\s]+$/, "").trim();
}

/** ISBN-10 を ISBN-13 に変換する（978 プレフィックス＋チェックディジット再計算） */
function isbn10to13(isbn10: string): string {
  const core = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += (i % 2 === 0 ? 1 : 3) * Number(core[i]);
  }
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

/** 定価欄・ISBN欄の自由テキストから ISBN-13（ハイフンなし）を取り出す。ISBN-10 は 13 桁へ変換する */
function extractIsbn(text: string): string | undefined {
  const s = normalizeIsbn(text);
  const m13 = s.match(/97[89]\d{10}/);
  if (m13) return m13[0];
  const m10 = s.match(/\d{9}[\dX]/);
  if (m10) return isbn10to13(m10[0]);
  return undefined;
}

/**
 * 定価欄を税込整数（円）に換算する。
 * - "1,528円（税込）" → 1528
 * - "定価：2,200円（本体価格2,000 円＋税10％）" → 2200（先頭が税込総額）
 * - "本体300円（税抜）" → 330（税抜表記は書籍の標準税率10%を上乗せ）
 */
function parseIpaPrice(text: string): number | undefined {
  const value = parseJapanesePrice(text);
  if (value === undefined) return undefined;
  if (text.includes("税抜") && !text.includes("税込")) {
    return Math.floor(value * 1.1);
  }
  return value;
}

/** ul.archive-list の各リンクを {title, url, isFolder} に変換する（isFolder はサブ一覧ページ） */
function extractArchiveLinks(
  doc: HtmlDocument,
  baseUrl: string,
): { title: string; url: string; isFolder: boolean }[] {
  const out: { title: string; url: string; isFolder: boolean }[] = [];
  for (const a of doc.select("ul.archive-list li a")) {
    const href = a.attr("href");
    if (!href) continue;
    const cls = a.attr("class") ?? "";
    out.push({
      title: trimTitle(a.text()),
      url: resolveUrl(baseUrl, href),
      isFolder: cls.includes("icon--folder"),
    });
  }
  return out;
}

/**
 * 書籍・刊行物一覧をカタログ化する。トップ一覧の書籍ページ（icon--webpage）に加え、
 * サブ一覧ページ（icon--folder。情報セキュリティ白書・ソフトウェア開発データ白書）を1階層展開する。
 * アーカイブは変動が少ないため全て長期キャッシュする。
 */
async function buildCatalog(deps: PublisherDeps): Promise<CatalogEntry[]> {
  const indexHtml = await fetchText(INDEX_URL, deps, undefined, CATALOG_CACHE_TTL_SECONDS);
  const top = extractArchiveLinks(deps.parser.parse(indexHtml), INDEX_URL);

  const books: CatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (title: string, url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    books.push({ title, url });
  };

  for (const e of top) {
    if (!e.isFolder) add(e.title, e.url);
  }

  for (const folder of top.filter(e => e.isFolder)) {
    try {
      const subHtml = await fetchText(folder.url, deps, undefined, CATALOG_CACHE_TTL_SECONDS);
      for (const e of extractArchiveLinks(deps.parser.parse(subHtml), folder.url)) {
        if (!e.isFolder) add(e.title, e.url);
      }
    } catch {
      // サブ一覧の取得に失敗しても他のカタログは返す
    }
  }

  return books;
}

/**
 * 詳細ページを BookRecord に変換する。data-list（書誌欄）を持たないページ（一覧の補助ページや
 * FAQ・ダウンロード案内など）は書籍ではないため null を返す。
 */
function parseBook(url: string, doc: HtmlDocument, fallbackTitle?: string): BookRecord | null {
  const dl = doc.selectOne("dl.data-list");
  if (!dl) return null;

  const title = trimTitle(doc.selectOne("h1.ttl.--lv1")?.text() ?? "") || fallbackTitle || "";
  if (!title) return null;

  // dt/dd を突き合わせて書誌欄をマップ化する
  const keys = dl.find(".data-list__ttl__inner");
  const values = dl.find(".data-list__data");
  const fields = new Map<string, string>();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]?.text().trim();
    const value = values[i]?.text().trim();
    if (key && value !== undefined) fields.set(key, value);
  }

  const publishedAt = fields.has("発行日")
    ? parseJapaneseDateToISO(fields.get("発行日")!)
    : undefined;
  const isbn = fields.has("ISBN") ? extractIsbn(fields.get("ISBN")!) : undefined;
  const price = fields.has("定価") ? parseIpaPrice(fields.get("定価")!) : undefined;

  const coverRaw = doc.selectOne(".img-box img")?.attr("src");
  const coverImageUrl = coverRaw ? resolveUrl(url, coverRaw) : undefined;

  // 概要の本文（注意書きの赤ボックスや空段落を除いた最初の段落）
  const description = doc.select("p.article-txt")
    .map(p => p.text().trim())
    .find(t => t && !t.startsWith("本ページの情報") && !t.includes("本事業は終了"));

  return {
    title,
    authors: [],
    publisher: PUBLISHER,
    url,
    isbn,
    price,
    publishedAt,
    description: description || undefined,
    coverImageUrl,
    // IPA アーカイブの PDF は無償配布・技術的DRMなし
    ebookStores: [{ name: "IPA", url, drm: "free" }],
  };
}

export const ipaAdapter: PublisherAdapter = {
  id: "ipa",
  name: "IPA（情報処理推進機構）",
  baseUrl: BASE_URL,
  scale: "minor",

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    // 検索APIがないため書籍・刊行物一覧をタイトルでローカルフィルタする。
    // 著者のみの検索は各詳細ページを全取得しないと不可能なため非対応。
    if (!query.title) return [];

    const keyword = query.title.toLowerCase();
    const limit = query.limit ?? 10;

    const catalog = await buildCatalog(deps);
    const matched = catalog
      .filter(e => e.title.toLowerCase().includes(keyword))
      .slice(0, limit);

    const results: BookRecord[] = [];
    for (const entry of matched) {
      try {
        const html = await fetchText(entry.url, deps, undefined, CATALOG_CACHE_TTL_SECONDS);
        const book = parseBook(entry.url, deps.parser.parse(html), entry.title);
        if (book) results.push(book);
      } catch {
        // 個別ページの取得・解析に失敗しても他の結果は返す
      }
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const book = parseBook(url, deps.parser.parse(html));
    if (!book) throw new Error(`IPA: 書誌情報を取得できませんでした: ${url}`);
    return book;
  },
};
