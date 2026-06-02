import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, resolveUrl } from "./base.js";

const BASE_URL = "https://www.seshop.com";
const SEARCH_URL = `${BASE_URL}/search`;

/** 電子書籍カテゴリID */
const EBOOK_CATEGORY_ID = "327";

/**
 * "2025.02.17発売" または "2025.02.17" → "2025-02-17"
 */
function parseDate(text: string): string | undefined {
  const m = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** 詳細ページをスクレイピングして BookRecord を組み立てる（search と getDetail で共用） */
async function fetchSeshopDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
  const html = await fetchText(url, deps);
  const doc = deps.parser.parse(html);

  const getMeta = (name: string): string | undefined =>
    doc.selectOne(`meta[name="${name}"]`)?.attr("content")?.trim() || undefined;

  const title =
    doc.selectOne("h1")?.text().trim() ||
    getMeta("cxenseparse:sho-product-name") ||
    "";

  // col-md-5 内の著者リンク（役割語は括弧内テキストノードで隣接しているがリンクテキストは名前のみ）
  const authors = doc.select("a[href*='/product/author/']")
    .map(el => el.text().trim())
    .filter(Boolean);

  const isbnRaw = getMeta("cxenseparse:sho-isbn");
  const isbn = isbnRaw ? isbnRaw.replace(/\s+/g, "") : undefined;

  // meta description は "＜翔泳社の公式通販＞ ｜<紹介文>" 形式。定型の接頭辞を除去する
  const descRaw = getMeta("description");
  const description = descRaw
    ? (descRaw.replace(/^＜翔泳社の公式通販＞\s*[｜|]\s*/, "").trim() || undefined)
    : undefined;

  const priceRaw = getMeta("cxenseparse:sho-price");
  const price = priceRaw ? parseInt(priceRaw, 10) : undefined;

  const dateRaw = getMeta("cxenseparse:sho-releasedate");
  const publishedAt = dateRaw ? parseDate(dateRaw) : undefined;

  // カバー画像: book-img または meta
  const coverImgEl = doc.selectOne("img.book-img");
  const coverSrc = coverImgEl?.attr("src") ?? getMeta("cxenseparse:recs:image");
  const coverImageUrl = coverSrc ? resolveUrl(BASE_URL, coverSrc) : undefined;

  return {
    title,
    authors,
    publisher: "翔泳社",
    url,
    isbn,
    price,
    publishedAt,
    coverImageUrl,
    description,
    ebookStores: [{ name: "SEshop", url, drm: "social" }],
  };
}

export const seshopAdapter: PublisherAdapter = {
  id: "seshop",
  name: "SEshop (翔泳社)",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${SEARCH_URL}?keyword=${encodeURIComponent(word)}&category_id=${EBOOK_CATEGORY_ID}&sort=newer`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const item of doc.select("div.inner")) {
      // 電子書籍のみ: data-category が "電子書籍" で始まるものに限定
      const dataEl = item.find("div.product-data")[0];
      const category = dataEl?.attr("data-category") ?? "";
      if (!category.startsWith("電子書籍")) continue;

      const linkEl = item.find("div.txt a")[0];
      if (!linkEl) continue;

      const title = linkEl.text().trim();
      const href = linkEl.attr("href");
      if (!title || !href) continue;

      const bookUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      const priceStr = dataEl?.attr("data-price");
      const price = priceStr ? parseInt(priceStr, 10) : undefined;

      const dateText = item.find("span.date")[0]?.text().trim();
      const publishedAt = dateText ? parseDate(dateText) : undefined;

      const imgEl = item.find("figure img")[0];
      const imgSrc = imgEl?.attr("src");
      const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

      results.push({
        title,
        authors: [],
        publisher: "翔泳社",
        url: bookUrl,
        price,
        publishedAt,
        coverImageUrl,
        ebookStores: [{ name: "SEshop", url: bookUrl, drm: "social" }],
      });

      if (results.length >= limit) break;
    }

    // 検索結果ページには著者・ISBN が無い（data-* に存在しない）ため、各ヒットの
    // 詳細ページから著者と ISBN を補完する。ISBN が付けばアプリ層の openBD 補完が
    // description 等もさらに埋める。詳細取得の失敗は握りつぶし基本情報のみ返す。
    return Promise.all(
      results.map(async (book) => {
        try {
          const detail = await fetchSeshopDetail(book.url, deps);
          return {
            ...book,
            authors: detail.authors.length > 0 ? detail.authors : book.authors,
            isbn: detail.isbn ?? book.isbn,
            description: detail.description ?? book.description,
          };
        } catch {
          return book;
        }
      }),
    );
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    return fetchSeshopDetail(url, deps);
  },
};
