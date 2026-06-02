import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, EbookStore, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, resolveUrl, CATALOG_CACHE_TTL_SECONDS } from "./base.js";

const BASE_URL = "https://www.personal-media.co.jp";
const WEBSHOP_URL = `${BASE_URL}/webshop/book/`;

/** "2001年11月 発売" → "2001-11-01" （日不明のため1日固定） */
function parseYearMonth(text: string): string | undefined {
  const m = text.match(/(\d{4})年(\d{1,2})月/);
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-01`;
}

/**
 * テキスト行が著者行であれば著者名配列を返す。
 * "坂村　健 監修" → ["坂村　健"]
 * "A, B 著" → ["A", "B"]
 */
function parseAuthorLine(text: string): string[] | null {
  const m = text.match(/^(.+?)\s+(?:著者|著|監修|編著|編集|編|訳|監訳|共著|共編|翻訳)$/);
  if (!m) return null;
  return m[1].split(/[,，、・]/).map(n => n.trim()).filter(Boolean);
}

export const personalMediaAdapter: PublisherAdapter = {
  id: "personal-media",
  name: "パーソナルメディア",
  baseUrl: BASE_URL,
  scale: "minor",

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    // ローカルフィルタ型：タイトルなし検索は非対応
    if (!query.title) return [];

    const html = await fetchText(WEBSHOP_URL, deps, undefined, CATALOG_CACHE_TTL_SECONDS);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;
    const keyword = query.title.toLowerCase();

    for (const tr of doc.select("table tr")) {
      // ヘッダー行をスキップ
      if (tr.find("th").length > 0) continue;

      // 最初の td a が書籍詳細ページへのリンク
      const linkEl = tr.find("td a")[0];
      if (!linkEl) continue;

      const title = linkEl.text().trim();
      if (!title) continue;
      if (!title.toLowerCase().includes(keyword)) continue;

      const href = linkEl.attr("href");
      if (!href || !href.includes("/book/")) continue;

      const bookUrl = resolveUrl(WEBSHOP_URL, href);

      // 最後の td が税込価格
      const tds = tr.find("td");
      const price = tds.length > 0
        ? parseJapanesePrice(tds[tds.length - 1].text())
        : undefined;

      results.push({
        title,
        authors: [],
        publisher: "パーソナルメディア",
        url: bookUrl,
        price,
        ebookStores: [],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const title = doc.selectOne("h1")?.text().trim() ?? "";

    // カバー画像（"_l." パターンで書影を識別）
    const coverImgEl = doc.select("img").find(
      el => (el.attr("src") ?? "").includes("_l."),
    );
    const coverSrc = coverImgEl?.attr("src");
    const coverImageUrl = coverSrc ? resolveUrl(url, coverSrc) : undefined;

    // ページ全体テキストを行分割してメタデータを抽出
    const lines = (doc.selectOne("body")?.text() ?? "")
      .split(/[\n\r]+/)
      .map(l => l.trim())
      .filter(Boolean);

    const authors: string[] = [];
    let isbn: string | undefined;
    let publishedAt: string | undefined;
    let price: number | undefined;

    for (const line of lines) {
      // 著者行
      const authorNames = parseAuthorLine(line);
      if (authorNames) {
        authors.push(...authorNames);
        continue;
      }
      // ISBN（"ISBN 978-..." 形式）
      if (!isbn && line.includes("ISBN")) {
        const m = line.match(/(\d[\d-]{12,})/);
        if (m) isbn = m[1].replace(/-/g, "");
        continue;
      }
      // 発行日（"発売" を含む行）
      if (!publishedAt && line.includes("発売")) {
        publishedAt = parseYearMonth(line);
      }
      // 定価
      if (!price && line.startsWith("定価")) {
        price = parseJapanesePrice(line);
      }
    }

    // 電子書籍ストアを手動検出（相対URLのため extractEbookStoresFromDoc は不使用）
    const ebookStores: EbookStore[] = [];

    const allLinks = doc.select("a[href]");

    // PDF版（ウェブショップ）
    const webshopLink = allLinks.find(
      el => (el.attr("href") ?? "").includes("/webshop/book/"),
    );
    if (webshopLink) {
      ebookStores.push({
        name: "パーソナルメディア",
        url: resolveUrl(url, webshopLink.attr("href")!),
        drm: "social",
      });
    }

    // Smooth Reader版（専用ビューアー）
    const smoothReaderLink = allLinks.find(
      el => (el.attr("href") ?? "").includes("/smoothreader/store/"),
    );
    if (smoothReaderLink) {
      ebookStores.push({
        name: "Smooth Reader",
        url: resolveUrl(url, smoothReaderLink.attr("href")!),
        drm: "drm",
      });
    }

    return {
      title,
      authors,
      publisher: "パーソナルメディア",
      url,
      isbn,
      price,
      publishedAt,
      coverImageUrl,
      ebookStores,
    };
  },
};
