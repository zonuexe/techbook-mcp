import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, resolveUrl, extractEbookStoresFromDoc, parseJapaneseDateToISO, stripAuthorRole } from "./base.js";

const BASE_URL = "https://www.maruzen-publishing.co.jp";
const SEARCH_URL = `${BASE_URL}/search/`;

/** 403回避のために自サイトをRefererとして付与する必要がある */
const EXTRA_HEADERS = { Referer: `${BASE_URL}/` };

/**
 * "ボリス・チェルニー 著　折山文哉 訳" → ["ボリス・チェルニー", "折山文哉"]
 * 役割語（著・訳・編・監訳・監修など）を除去する。
 */
function parseAuthorsFromText(text: string): string[] {
  return text.split(/[　\s]+(?=\S)/).map(stripAuthorRole).filter(Boolean);
}

/**
 * div.author 内の各リンクから役割語を除去して著者名のみ返す。
 */
function parseAuthorLinks(authors: string[]): string[] {
  return authors.map(stripAuthorRole).filter(Boolean);
}

/**
 * "2020/03/31" → "2020-03-31"
 * "2020年3月31日" → "2020-03-31"
 */
function parseDate(text: string): string | undefined {
  const m1 = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m1) {
    return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  }
  return parseJapaneseDateToISO(text);
}

export const maruzenPublishingAdapter: PublisherAdapter = {
  id: "maruzen-publishing",
  name: "丸善出版",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${SEARCH_URL}?search_keyword=${encodeURIComponent(word)}&format=1`;
    const html = await fetchText(url, deps, EXTRA_HEADERS);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const item of doc.select("div.booklist div.item")) {
      const linkEl = item.find("div.ttl a")[0];
      if (!linkEl) continue;

      const title = linkEl.text().trim();
      const href = linkEl.attr("href");
      if (!title || !href) continue;

      const bookUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      const authorLinks = item.find("div.author a").map(el => el.text().trim());
      const authors = parseAuthorLinks(authorLinks);

      const imgEl = item.find("div.image img")[0];
      const imgSrc = imgEl?.attr("src");
      const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

      results.push({
        title,
        authors,
        publisher: "丸善出版",
        url: bookUrl,
        coverImageUrl,
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps, EXTRA_HEADERS);
    const doc = deps.parser.parse(html);

    // タイトルは <title> タグ、またはh1など（サイト構造に依存）
    // div#bookData table の th/td からメタデータを取得
    const table = doc.selectOne("div#bookData table");
    let authors: string[] = [];
    let publisher = "丸善出版";
    let publishedAt: string | undefined;

    if (table) {
      for (const row of table.find("tr")) {
        const th = row.find("th")[0]?.text().trim() ?? "";
        const tdText = row.find("td")[0]?.text().trim() ?? "";

        if (th === "著者") {
          authors = parseAuthorsFromText(tdText);
        } else if (th === "発行元") {
          publisher = tdText || "丸善出版";
        } else if (th === "出版年月日") {
          publishedAt = parseDate(tdText);
        }
      }
    }

    // ページタイトルから書籍タイトルを取得（" | 丸善出版" を除去）
    const pageTitle = doc.selectOne("title")?.text().trim() ?? "";
    const title = pageTitle.replace(/\s*[|｜]\s*丸善出版.*$/, "").trim();

    // 電子書籍ストア（kw.maruzen.co.jp は機関向けなので除外）
    const ebookStores = extractEbookStoresFromDoc(doc).filter(
      store => !store.url.includes("kw.maruzen.co.jp"),
    );

    return {
      title,
      authors,
      publisher,
      url,
      publishedAt,
      ebookStores: ebookStores.length > 0 ? ebookStores : undefined,
    };
  },
};
