import type { BookRecord, SearchQuery } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";

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
    targets.map(p => p.search(query, deps)),
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

  return { books, errors };
}
