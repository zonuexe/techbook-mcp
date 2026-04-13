import type { BookRecord } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import { checkRobotsTxt } from "../adapters/publishers/base.js";
import { fetchOpenBDBooks, enrichWithOpenBD } from "../adapters/openbd.js";

export async function getBookDetail(
  url: string,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<BookRecord> {
  const publisher = publishers.find(p => url.startsWith(p.baseUrl));
  if (!publisher) {
    throw new Error(
      `このURLに対応する出版社アダプターがありません: ${url}\n` +
      `対応URL: ${publishers.map(p => p.baseUrl).join(", ")}`,
    );
  }

  const allowed = await checkRobotsTxt(url, deps);
  if (!allowed) {
    throw new Error(`robots.txt によりアクセスが禁止されています: ${url}`);
  }

  const book = await publisher.getDetail(url, deps);

  // ISBNが特定できる場合はopenBDで欠損フィールドを補完
  if (book.isbn !== undefined) {
    try {
      const openBDMap = await fetchOpenBDBooks([book.isbn], deps);
      const entry = openBDMap.get(book.isbn);
      if (entry !== undefined) {
        return enrichWithOpenBD(book, entry);
      }
    } catch {
      // openBD の取得失敗は無視して出版社から取得できた情報を返す
    }
  }

  return book;
}
