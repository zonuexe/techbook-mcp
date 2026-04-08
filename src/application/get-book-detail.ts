import type { BookRecord } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";

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
  return publisher.getDetail(url, deps);
}
