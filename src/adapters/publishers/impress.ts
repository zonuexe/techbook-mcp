import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery, DrmType } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, stripAuthorRole } from "./base.js";

const BASE_URL = "https://book.impress.co.jp";

/** "2026/1/22" → "2026-01-22" */
function parseImpressDate(text: string): string | undefined {
  const m = text.trim().match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/**
 * 著者文字列から著者名配列を返す。
 * 例: "山本康太　著" → ["山本康太"]
 * 複数著者は「、」または改行で区切られる。
 */
function parseAuthors(text: string): string[] {
  return text
    .split(/[、,\n]/)
    .map(s => stripAuthorRole(s.trim()))
    .filter(Boolean);
}

/**
 * 電子書籍ガイドのテキストから DRM 種別を判定する。
 * 明示されていない場合はインプレスの公式方針に基づき social を返す。
 */
function parseDrmType(text: string): DrmType {
  if (/ソーシャルDRM/i.test(text)) return "social";
  if (/DRM-?free|DRMフリー/i.test(text)) return "free";
  if (/パスワード/i.test(text)) return "password_pdf";
  return "social";
}

export const impressBooksAdapter: PublisherAdapter = {
  id: "impress-books",
  name: "インプレスブックス",
  baseUrl: BASE_URL,

  async search(_query: SearchQuery, _deps: PublisherDeps): Promise<BookRecord[]> {
    // 検索ページは Google Custom Search Engine による JavaScript レンダリングのためスクレイピング不可
    return [];
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    // タイトル（ページ内最初の h2）
    const title = doc.selectOne("h2")?.text().trim() ?? "";

    // dl.module-book-data の dt/dd を順序でペアリング
    const dts = doc.select("dl.module-book-data dt");
    const dds = doc.select("dl.module-book-data dd");
    const bookDataMap = new Map<string, string>();
    for (let i = 0; i < dts.length; i++) {
      const key = dts[i].text().trim();
      const val = dds[i]?.text().trim() ?? "";
      if (key) bookDataMap.set(key, val);
    }

    const authors = parseAuthors(bookDataMap.get("著者") ?? "");
    const isbn = bookDataMap.get("ISBN")?.replace(/\s/g, "") || undefined;
    const publishedAt = parseImpressDate(bookDataMap.get("発売日") ?? "");

    // カバー画像（img.ips.co.jp のプロトコル相対URLに https: を補完）
    const coverSrc = doc.selectOne(".block-book-detail-img img")?.attr("src");
    const coverImageUrl = coverSrc
      ? (coverSrc.startsWith("//") ? `https:${coverSrc}` : coverSrc)
      : undefined;

    // 電子版価格・DRM
    const ebookGuide = doc.selectOne(".module-e-book-buy-guide-txt");
    const ebookBuyBtn = doc.selectOne(".module-e-book-buy-guide-btn a");

    let price: number | undefined;
    let drm: DrmType = "social";

    if (ebookGuide) {
      const priceText = ebookGuide.find(".module-e-book-price")[0]?.text();
      if (priceText) price = parseJapanesePrice(priceText);
      drm = parseDrmType(ebookGuide.text());
    }

    const ebookStores = ebookBuyBtn
      ? [{ name: "インプレスブックス", url, drm }]
      : [];

    return {
      title,
      authors,
      publisher: "インプレスブックス",
      url,
      isbn,
      price,
      publishedAt,
      coverImageUrl,
      ebookStores,
    };
  },
};
