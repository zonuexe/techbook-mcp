import type { PublisherDeps } from "../domain/publisher.js";
import type { BookRecord } from "../domain/book.js";
import { fetchText } from "./publishers/base.js";

export const CALIL_BASE_URL = "https://calil.jp";

/**
 * カーリルの書籍詳細ページ (/book/{isbn}) から書誌情報を取得する。
 * openBD に存在しない書籍（廃業出版社など）のフォールバックとして使用する。
 * @returns 書誌情報が見つかれば BookRecord、ページが存在しなければ null。
 */
export async function fetchCalilBook(
  isbn: string,
  deps: PublisherDeps,
): Promise<BookRecord | null> {
  const url = `${CALIL_BASE_URL}/book/${isbn}`;
  let html: string;
  try {
    html = await fetchText(url, deps);
  } catch {
    return null;
  }

  const doc = deps.parser.parse(html);

  const title = doc.selectOne("h1.title[itemprop='name']")?.text().trim();
  if (!title) return null;

  // 著者: div.author 内の <a> テキストを収集する
  // <div class="author" itemprop="author">
  //   <a href="/search?q=author:...">WebビジネスPHP研究部会</a><span>（著）</span>
  // </div>
  const authorLinks = doc.select("div[itemprop='author'] a");
  const authors = authorLinks.map(el => el.text().trim()).filter(Boolean);

  const publisher = doc.selectOne("span[itemprop='publisher']")?.text().trim() || undefined;

  // "(2002-02-01)" → "2002-02-01"
  const rawDate = doc.selectOne("span[itemprop='datePublished']")?.text().trim();
  const publishedAt = rawDate ? rawDate.replace(/^\(|\)$/g, "").trim() || undefined : undefined;

  // ISBN-13: <span itemprop="isbn">ISBN-13:</span> 9784901676038 の形式
  const isbn13Match = html.match(/ISBN-13:[^<]*<\/span>[^<\d]*(97[89]\d{10})/);
  const isbn13 = isbn13Match?.[1] ?? isbn;

  const coverImageUrl = doc.selectOne("img[itemprop='image']")?.attr("src") || undefined;

  return {
    title,
    authors,
    publisher: publisher ?? "",
    isbn: isbn13,
    publishedAt,
    url,
    coverImageUrl,
  };
}
