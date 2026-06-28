import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, EbookStore, SearchQuery } from "../../domain/book.js";
import type { HtmlDocument, HtmlElement } from "../../ports/html-parser.js";
import { fetchText, parseJapanesePrice, resolveUrl, stripAuthorRole } from "./base.js";
import { collapseWhitespace } from "../../domain/title.js";

const BASE_URL = "https://www.c-r.com";
// 商品検索フォーム（method=post / sflg=1）。GET でも同じ結果を返すため fetchText(GET) で叩く
const SEARCH_URL = `${BASE_URL}/book/listthum/index`;

/**
 * C&R研究所（株式会社シーアンドアール研究所）。
 * 自社通販は「本の森.JP」としてマイナビ出版の manatee 基盤に統合されている
 * （アカウント共通）。本アダプターは出版社公式サイト c-r.com を正典として書誌を取得し、
 * 電子書籍の購入動線は詳細ページ内の本の森.JP（manatee）リンクを ebookStore に充てる。
 */

/** "2,720円＋税" → 税込 2992。税抜表記を検知して消費税10%(書籍は標準税率)を加算し切り捨てる */
function parseCrPrice(text: string): number | undefined {
  const m = text.match(/価格[：:]\s*([\d,]+)\s*円\s*([＋+]税|税別|本体)?/);
  if (!m) return undefined;
  const base = parseJapanesePrice(m[1]);
  if (base === undefined) return undefined;
  // 税抜表記（＋税 / 税別 / 本体）なら 10% 加算。税込/表記なしはそのまま
  return m[2] ? Math.floor(base * 1.1) : base;
}

/** "ISBN978-4-86354-512-0" / "ISBNコード：978-4-86354-512-0" → "9784863545120" */
function parseCrIsbn(text: string): string | undefined {
  const m = text.match(/ISBN(?:コード)?[：:]?\s*(97[89][-\d]+\d)/);
  if (!m) return undefined;
  const digits = m[1].replace(/[^\d]/g, "");
  return digits.length === 13 ? digits : undefined;
}

/** "著者：福田 敦史" / "著者：牧田剣吾／松浦崇仁" → ["福田 敦史"] / ["牧田剣吾", "松浦崇仁"] */
function parseCrAuthors(text: string): string[] {
  const m = text.match(/著者[：:]\s*([^\n]+)/);
  if (!m) return [];
  return m[1]
    .split(/[、，,／/・]/)
    .map(name => stripAuthorRole(name.trim()))
    .filter(Boolean);
}

/** 要素内の <br> を改行に変換してからテキスト化する（著者行と説明文の境界を保つため） */
function blockText(el: HtmlElement): string {
  const html = el.html() ?? "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ");
}

/** 詳細ページ内リンクから本の森.JP(manatee) の購入動線を ebookStore として抽出する */
function ebookStoresFromDoc(doc: HtmlDocument): EbookStore[] {
  for (const a of doc.select("a[href]")) {
    const href = a.attr("href");
    if (href && /book\.mynavi\.jp\/manatee\//.test(href)) {
      // 本の森.JP は manatee 基盤のソーシャルDRM（PDFに購入者情報を埋め込み）
      return [{ name: "本の森.JP", url: href, drm: "social" }];
    }
  }
  return [];
}

export const crAdapter: PublisherAdapter = {
  id: "c-r",
  name: "C&R研究所",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${SEARCH_URL}?word=${encodeURIComponent(word)}&sflg=1`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    // 各書籍は `div.clearfix`（書影 .fll ＋ 本文 .flr > .book02）で 1 件。
    // 商品アイテムのみ拾うため book05(タイトル) をちょうど 1 つ含む clearfix に絞る。
    for (const item of doc.select("div.clearfix")) {
      const titleLinks = item.find("p.book05 a");
      if (titleLinks.length !== 1) continue;

      const titleEl = titleLinks[0];
      const title = collapseWhitespace(titleEl.text());
      if (!title) continue;

      const href = titleEl.attr("href");
      if (!href) continue;
      const bookUrl = resolveUrl(BASE_URL, href);

      const meta = blockText(item.find("div.book02")[0] ?? item);
      const price = parseCrPrice(meta);
      const isbn = parseCrIsbn(meta);
      const authors = parseCrAuthors(meta);

      const imgSrc = item.find("div.fll img")[0]?.attr("src");
      const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

      results.push({
        title,
        authors,
        publisher: "C&R研究所",
        url: bookUrl,
        isbn,
        price,
        coverImageUrl,
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const title = collapseWhitespace(doc.selectOne("p.book_s_title")?.text() ?? "");

    const metaEl = doc.selectOne("div.book_s02");
    const meta = metaEl ? blockText(metaEl) : "";
    const price = parseCrPrice(meta);
    const isbn = parseCrIsbn(meta);
    const authors = parseCrAuthors(meta);

    // 最初の .book_s01 が紹介文（以降は目次・著者紹介・担当編集者から）
    const description = doc.select("p.book_s01")[0]?.text().trim() || undefined;

    // 書影は詳細ページの大サイズ画像（.book_s02 周辺の .frame）
    const imgSrc = doc.selectOne("div.shadow img.frame")?.attr("src");
    const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

    const ebookStores = ebookStoresFromDoc(doc);

    return {
      title,
      authors,
      publisher: "C&R研究所",
      url,
      isbn,
      price,
      description,
      coverImageUrl,
      ebookStores: ebookStores.length > 0 ? ebookStores : undefined,
    };
  },
};
