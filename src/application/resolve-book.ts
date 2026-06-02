import type { BookRecord, SearchQuery } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import { searchBooks, type ScoredBook } from "./search-books.js";
import { resolveByIsbn, type IsbnSource } from "./get-book-by-isbn.js";
import { mapWithConcurrency } from "./concurrency.js";
import { looksLikeIsbn } from "../domain/isbn.js";
import { titleMatchScore } from "../domain/text-match.js";

/**
 * 同定（resolve）クエリ。Riida の read_pdf_colophon が抽出した手がかりを
 * そのまま渡せる。すべて任意だが、isbn / title / author のいずれかは必要。
 */
export interface ResolveQuery {
  isbn?: string;
  title?: string;
  author?: string;
  publisherId?: string;
}

export type ResolveConfidence = "high" | "medium" | "low";
export type ResolveStatus = "matched" | "ambiguous" | "not_found";
export type ResolveSource = IsbnSource | "search" | "none";

export interface ResolveResult {
  /** matched=本命確定 / ambiguous=候補が拮抗 / not_found=該当なし */
  status: ResolveStatus;
  /** 自動採用の可否目安。high=無確認で採用可、medium=ほぼ確実、low=要確認 */
  confidence: ResolveConfidence;
  /** ベストマッチ。not_found のとき null */
  book: BookRecord | null;
  /** クエリとの一致度（ISBN 完全一致は 1）。0..1 */
  matchScore: number;
  /** 取得元 */
  source: ResolveSource;
  /** isbn と title の両方が与えられたときのみ：解決結果が title と一致するか（版違い検出） */
  validation?: { isbnTitleAgree: boolean };
  /** ambiguous のとき上位候補を返す */
  candidates?: ScoredBook[];
  /** not_found のとき理由 */
  reason?: string;
}

/** title が ISBN 解決結果と一致しているとみなす最小スコア */
const TITLE_AGREE_THRESHOLD = 0.5;
/** confidence: high とみなす最小 matchScore */
const HIGH_SCORE = 0.9;
/** confidence: medium とみなす最小 matchScore */
const MEDIUM_SCORE = 0.5;
/** 上位2件がこの差未満なら ambiguous（候補拮抗）とみなす */
const AMBIGUOUS_GAP = 0.1;
/** バッチ解決の並列度（各 title クエリは横断検索を伴うため低めに抑える） */
const RESOLVE_BATCH_CONCURRENCY = 4;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function scoreToConfidence(score: number): ResolveConfidence {
  if (score >= HIGH_SCORE) return "high";
  if (score >= MEDIUM_SCORE) return "medium";
  return "low";
}

/**
 * 手がかり（ISBN / 書名 / 著者）から正規の1冊を確信度つきで同定する。
 *
 * - isbn があれば openBD→出版社→カーリルで解決（resolveByIsbn）。title も来ていれば
 *   解決結果と照合して版違い・誤ISBNを検出する（validation.isbnTitleAgree）。
 * - isbn が無い／解決できない場合は横断検索の matchScore でベストマッチを採る。
 *   上位が拮抗していれば status="ambiguous" として候補を返す。
 */
export async function resolveBook(
  query: ResolveQuery,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<ResolveResult> {
  const isbn = query.isbn?.trim();
  const hasTextQuery = Boolean(query.title || query.author);

  if (isbn && looksLikeIsbn(isbn)) {
    const resolved = await resolveByIsbn(isbn, publishers, deps);
    if (resolved) {
      const { book, source } = resolved;
      if (query.title) {
        const ts = titleMatchScore(query.title, book.title);
        const agree = ts >= TITLE_AGREE_THRESHOLD;
        return {
          status: "matched",
          confidence: agree ? "high" : "low",
          book,
          matchScore: round3(ts),
          source,
          validation: { isbnTitleAgree: agree },
        };
      }
      // ISBN は完全一致＝正準。照合する title が無ければ高確信
      return { status: "matched", confidence: "high", book, matchScore: 1, source };
    }
    // ISBN 指定だが見つからない。title/author も無ければ確定的に not_found
    if (!hasTextQuery) {
      return {
        status: "not_found",
        confidence: "low",
        book: null,
        matchScore: 0,
        source: "none",
        reason: `ISBN ${isbn} の書誌情報が見つかりませんでした`,
      };
    }
    // title/author があれば検索経路へフォールバック
  }

  if (!hasTextQuery) {
    return {
      status: "not_found",
      confidence: "low",
      book: null,
      matchScore: 0,
      source: "none",
      reason: "isbn / title / author のいずれも指定がありません",
    };
  }

  const searchQuery: SearchQuery = {
    title: query.title,
    author: query.author,
    publisherId: query.publisherId,
    limit: 5,
  };
  const { books } = await searchBooks(searchQuery, publishers, deps);

  if (books.length === 0) {
    return {
      status: "not_found",
      confidence: "low",
      book: null,
      matchScore: 0,
      source: "none",
      reason: "一致する書籍が見つかりませんでした",
    };
  }

  const best = books[0];
  const second = books[1];
  const confidence = scoreToConfidence(best.matchScore);
  const ambiguous =
    second !== undefined &&
    best.matchScore < 1 &&
    best.matchScore >= MEDIUM_SCORE &&
    best.matchScore - second.matchScore < AMBIGUOUS_GAP;

  if (ambiguous) {
    return {
      status: "ambiguous",
      confidence,
      book: best,
      matchScore: best.matchScore,
      source: "search",
      candidates: books.slice(0, 3),
    };
  }

  return {
    status: "matched",
    confidence,
    book: best,
    matchScore: best.matchScore,
    source: "search",
  };
}

/**
 * 複数の手がかりを一括で同定する（Riida の一括メタ付与・batch update に対応）。
 * 入力順に揃った結果配列を返す。個々の失敗は not_found 結果に変換し、配列全体は失敗しない。
 */
export async function resolveBooks(
  queries: readonly ResolveQuery[],
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<ResolveResult[]> {
  const settled = await mapWithConcurrency(
    queries,
    RESOLVE_BATCH_CONCURRENCY,
    (query) => resolveBook(query, publishers, deps),
  );
  return settled.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          status: "not_found" as const,
          confidence: "low" as const,
          book: null,
          matchScore: 0,
          source: "none" as const,
          reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
  );
}
