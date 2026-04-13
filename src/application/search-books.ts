import type { BookRecord, SearchQuery } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import { checkRobotsTxt } from "../adapters/publishers/base.js";
import { fetchOpenBDBooks, enrichWithOpenBD } from "../adapters/openbd.js";

export interface SearchBooksResult {
  books: BookRecord[];
  errors: Array<{ publisherId: string; message: string }>;
}

export async function searchBooks(
  query: SearchQuery,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<SearchBooksResult> {
  const targets = query.publisherId
    ? publishers.filter(p => p.id === query.publisherId)
    : publishers;

  const results = await Promise.allSettled(
    targets.map(async (p) => {
      const allowed = await checkRobotsTxt(p.baseUrl, deps);
      if (!allowed) throw new Error(`robots.txt によりアクセスが禁止されています: ${p.baseUrl}`);
      return p.search(query, deps);
    }),
  );

  const books: BookRecord[] = [];
  const errors: Array<{ publisherId: string; message: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const publisher = targets[i];
    if (result.status === "fulfilled") {
      books.push(...result.value);
    } else {
      const message = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      errors.push({ publisherId: publisher.id, message });
    }
  }

  // ISBNが特定できる書籍をopenBDで一括補完
  const isbns = books.map(b => b.isbn).filter((isbn): isbn is string => isbn !== undefined);
  if (isbns.length > 0) {
    try {
      const openBDMap = await fetchOpenBDBooks(isbns, deps);
      for (let i = 0; i < books.length; i++) {
        const isbn = books[i].isbn;
        if (isbn !== undefined) {
          const entry = openBDMap.get(isbn);
          if (entry !== undefined) {
            books[i] = enrichWithOpenBD(books[i], entry);
          }
        }
      }
    } catch {
      // openBD の取得失敗は無視して出版社から取得できた情報を返す
    }
  }

  return { books, errors };
}
