import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import type { HtmlElement } from "../../ports/html-parser.js";
import { fetchText, parseJapanesePrice, resolveUrl, stripAuthorRole } from "./base.js";

// CQ出版社の電子書籍直販サイト「Tech Village 書庫＆販売」
const BASE_URL = "https://cc.cqpub.co.jp";
// 検索キーワードは CakePHP の名前付きパラメータとしてパスに埋め込む
// 例: /lib/system/doclib_search/q=c%E8%A8%80%E8%AA%9E/
const SEARCH_URL = `${BASE_URL}/lib/system/doclib_search`;

const PUBLISHER = "CQ出版社";
// PDFに購入者情報の電子透かしを埋め込む（2017年導入）。標準PDFビューアで閲覧可・技術的制限なし
const STORE_NAME = "CQ出版 Tech Village";
const STORE_DRM = "social" as const;

/** "信頼性＆再利用性を高めるC言語プログラミング【PDF版】" → "...プログラミング" */
function cleanTitle(raw: string): string {
  let s = raw.trim();
  // 末尾の【PDF版】【EPUB版】【電子書籍版】などの形式マーカーを除去（重複表記にも対応）
  while (/【[^】]*版】\s*$/.test(s)) {
    s = s.replace(/【[^】]*版】\s*$/, "").trim();
  }
  return s;
}

/** "2026/04/01" → "2026-04-01" */
function parseDate(text: string): string | undefined {
  const m = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** "鹿取　祐二(早稲田大学)　著" → "鹿取　祐二"（所属・役割語を除去） */
function parseAuthorName(text: string): string {
  return stripAuthorRole(text.replace(/[(（].*?[)）]/g, "")).trim();
}

/** 商品詳細テーブルの th をキー、td 要素を値とするマップを返す */
function parseDetailTable(rows: HtmlElement[]): Map<string, HtmlElement> {
  const map = new Map<string, HtmlElement>();
  for (const row of rows) {
    const key = row.find("th")[0]?.text().trim();
    const td = row.find("td")[0];
    if (key && td) map.set(key, td);
  }
  return map;
}

export const cqPublishingAdapter: PublisherAdapter = {
  id: "cq-publishing",
  name: "CQ出版社",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${SEARCH_URL}/q=${encodeURIComponent(word)}/`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const item of doc.select("ul.itemList.books04 li")) {
      const linkEl = item.find(".mainTitle a")[0];
      const href = linkEl?.attr("href");
      if (!href) continue;
      const bookUrl = resolveUrl(BASE_URL, href);

      const title = cleanTitle(linkEl.text());
      if (!title) continue;

      const description = item.find(".subTitle")[0]?.text().trim() || undefined;

      const priceText = item.find(".price span")[0]?.text();
      const price = priceText ? parseJapanesePrice(priceText) : undefined;

      const coverSrc = item.find("dt img")[0]?.attr("src");
      const coverImageUrl = coverSrc ? resolveUrl(BASE_URL, coverSrc) : undefined;

      results.push({
        title,
        authors: [],
        publisher: PUBLISHER,
        url: bookUrl,
        price,
        coverImageUrl,
        description,
        ebookStores: [{ name: STORE_NAME, url: bookUrl, drm: STORE_DRM }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const title = cleanTitle(doc.selectOne(".itemTitleWrapper h2")?.text() ?? "");

    const table = parseDetailTable(doc.select("table[summary='商品詳細'] tr"));

    const authorTd = table.get("著者");
    let authors: string[] = [];
    if (authorTd) {
      const links = authorTd.find("a");
      const raw = links.length > 0
        ? links.map(el => el.text())
        : authorTd.text().split(/[,，、／/]/);
      authors = raw.map(parseAuthorName).filter(Boolean);
    }

    const priceText = table.get("価格（ライセンス料金）")?.text();
    const price = priceText ? parseJapanesePrice(priceText) : undefined;

    const publishedAt = parseDate(table.get("発行日")?.text() ?? "");

    const publisher = table.get("発行元")?.text().trim() || PUBLISHER;

    const description =
      doc.selectOne("#commentaryArea")?.text().trim() ||
      doc.selectOne(".itemTitleWrapper p")?.text().trim() ||
      undefined;

    const coverSrc = doc.selectOne("#itemPicArea img")?.attr("src");
    const coverImageUrl = coverSrc ? resolveUrl(BASE_URL, coverSrc) : undefined;

    return {
      title,
      authors,
      publisher,
      url,
      price,
      publishedAt,
      coverImageUrl,
      description,
      ebookStores: [{ name: STORE_NAME, url, drm: STORE_DRM }],
    };
  },
};
