import type { BookRecord, SearchQuery } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import { checkRobotsTxt } from "../adapters/publishers/base.js";
import { fetchOpenBDBooks, enrichWithOpenBD } from "../adapters/openbd.js";
import { matchScore } from "../domain/text-match.js";
import { dedupeAuthors } from "../domain/authors.js";
import { mapWithConcurrency, withTimeout, TimeoutError } from "./concurrency.js";

/** 1出版社あたりの検索タイムアウト。遅い1社が全体をブロックしないための上限 */
export const SEARCH_TIMEOUT_MS = 12_000;
/** 同時に叩く出版社サイト数の上限（サイト負荷・レート制限への配慮） */
export const SEARCH_CONCURRENCY = 6;

/** 検索結果の書籍。クエリとの一致度 matchScore（0..1）付き */
export type ScoredBook = BookRecord & { matchScore: number };

export type SearchErrorType = "robots" | "timeout" | "http" | "other";

export interface SearchError {
  publisherId: string;
  type: SearchErrorType;
  message: string;
}

export interface SearchBooksResult {
  books: ScoredBook[];
  errors: SearchError[];
}

/** 失敗理由を種別に分類する（errors の静音化・集約のため） */
function classifyError(reason: unknown): { type: SearchErrorType; message: string } {
  if (reason instanceof TimeoutError) return { type: "timeout", message: reason.message };
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes("robots.txt")) return { type: "robots", message };
  if (/^HTTP \d/.test(message)) return { type: "http", message };
  return { type: "other", message };
}

export async function searchBooks(
  query: SearchQuery,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<SearchBooksResult> {
  const matched = query.publisherId
    ? publishers.filter(p => p.id === query.publisherId)
    : publishers;

  // 大規模出版社を先に、小規模・専門サイト (scale: "minor") を後に回す。
  // 並列度が限られるなか、ヒット率の高い大手にスロットを優先的に割り当てる。
  const targets = [
    ...matched.filter(p => p.scale !== "minor"),
    ...matched.filter(p => p.scale === "minor"),
  ];

  const results = await mapWithConcurrency(targets, SEARCH_CONCURRENCY, async (p) => {
    const allowed = await checkRobotsTxt(p.baseUrl, deps);
    if (!allowed) throw new Error(`robots.txt によりアクセスが禁止されています: ${p.baseUrl}`);
    return withTimeout(p.search(query, deps), SEARCH_TIMEOUT_MS);
  });

  const books: BookRecord[] = [];
  const errors: SearchError[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const publisher = targets[i];
    if (result.status === "fulfilled") {
      // 言語が未設定の書籍に出版社の既定言語（省略時 "ja"）を刻む
      for (const book of result.value) {
        book.language ??= publisher.language ?? "ja";
      }
      books.push(...result.value);
    } else {
      errors.push({ publisherId: publisher.id, ...classifyError(result.reason) });
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

  // クエリとの一致度を付与し、著者の重複を除いて、ベストマッチ順に並べる
  const hasQuery = Boolean(query.title || query.author);
  const scored: ScoredBook[] = books
    .map(book => ({
      ...book,
      authors: dedupeAuthors(book.authors),
      matchScore: Math.round(matchScore(query, book) * 1000) / 1000,
    }))
    // クエリ語があるのに一致度ゼロ＝検索サイトが返す新着フォールバック等の無関係本。
    // 「該当なし」と「誤ヒット」を呼び出し側が区別できるよう、ここで除外して空にする。
    .filter(book => !hasQuery || book.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);

  return { books: scored, errors };
}
