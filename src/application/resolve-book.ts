import type { BookRecord, SearchQuery } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import { searchBooks, type ScoredBook } from "./search-books.js";
import { resolveByIsbn, type IsbnSource } from "./get-book-by-isbn.js";
import { mapWithConcurrency } from "./concurrency.js";
import { looksLikeIsbn } from "../domain/isbn.js";
import { titleMatchScore, sameWorkScore, titlesExactMatch, hasEditionMarker } from "../domain/text-match.js";

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
  /**
   * 与えられた手がかり（ISBN / title）と返却した本の照合結果。
   * book !== null（matched / ambiguous）なら必ず付与する（source に依存しない）。
   * 評価できない項目は null で明示する（ISBN 未指定なら isbnMatches=null、title 未指定なら title 系=null）。
   * - isbnMatches: 要求ISBN と返却 book.isbn が一致するか（ISBN 未指定時 null）。
   *   false は「要求ISBNは見つからず、書名一致で代替候補を返している」警告。
   * - isbnTitleAgree: 同一作品とみなせるか（版違いでも true）
   * - titleExact: 版表記も含めて完全一致か
   * - sameWork: 同一作品らしさ 0..1（版表記を畳んで照合）
   * - editionDiffers: 同一作品だが版表記が異なる（版が違う可能性）。
   *   ISBN が一致しているときは版が確定するため常に false。
   * sameWork が低い（≈0）かつ titleExact=false は「誤ISBN（別作品）」の疑い。
   */
  validation?: {
    isbnMatches: boolean | null;
    isbnTitleAgree: boolean | null;
    titleExact: boolean | null;
    sameWork: number | null;
    editionDiffers: boolean;
  };
  /** ambiguous のとき上位候補を返す */
  candidates?: ScoredBook[];
  /** not_found のとき理由 */
  reason?: string;
}

/** title が ISBN 解決結果と同一作品とみなす最小 sameWork スコア */
const SAME_WORK_THRESHOLD = 0.5;
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

/** ISBN を比較用に正規化（ハイフン除去）。未指定なら undefined */
function normalizeIsbn(isbn: string | undefined): string | undefined {
  return isbn ? isbn.replace(/-/g, "") : undefined;
}

type Validation = NonNullable<ResolveResult["validation"]>;

/**
 * 手がかり（要求ISBN・クエリ書名）と返却した本の照合結果を組み立てる。
 * 評価できない項目は null。ISBN が一致するときは版が確定するため editionDiffers=false。
 */
function buildValidation(
  reqIsbn: string | undefined,
  queryTitle: string | undefined,
  book: BookRecord,
): Validation {
  const bookIsbn = normalizeIsbn(book.isbn);
  const isbnMatches =
    reqIsbn === undefined ? null : bookIsbn !== undefined && bookIsbn === reqIsbn;

  if (!queryTitle) {
    return { isbnMatches, isbnTitleAgree: null, titleExact: null, sameWork: null, editionDiffers: false };
  }

  const same = sameWorkScore(queryTitle, book.title);
  const exact = titlesExactMatch(queryTitle, book.title);
  const agree = same >= SAME_WORK_THRESHOLD;
  // 版マーカーが実在し、かつ ISBN で版が確定していないときだけ「版違い」とする
  const editionDiffers =
    isbnMatches !== true &&
    agree &&
    !exact &&
    (hasEditionMarker(queryTitle) || hasEditionMarker(book.title));

  return {
    isbnMatches,
    isbnTitleAgree: agree,
    titleExact: exact,
    sameWork: round3(same),
    editionDiffers,
  };
}

/** ScoredBook の matchScore を落として素の BookRecord にする（top-level matchScore と重複させない） */
function stripScore(book: ScoredBook): BookRecord {
  const rest: Partial<ScoredBook> = { ...book };
  delete rest.matchScore;
  return rest as BookRecord;
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
  // 検索フォールバック時にも要求ISBNと照合できるよう、正規化済みISBNを保持する
  const reqIsbn = isbn && looksLikeIsbn(isbn) ? normalizeIsbn(isbn) : undefined;

  if (reqIsbn !== undefined) {
    const resolved = await resolveByIsbn(isbn as string, publishers, deps);
    if (resolved) {
      const { book, source } = resolved;
      const validation = buildValidation(reqIsbn, query.title, book);
      return {
        status: "matched",
        // title があり別作品（誤ISBN疑い）なら低確信、それ以外は高確信
        confidence: validation.isbnTitleAgree === false ? "low" : "high",
        book,
        matchScore: query.title ? round3(titleMatchScore(query.title, book.title)) : 1,
        source,
        validation,
      };
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
  const validation = buildValidation(reqIsbn, query.title, best);
  // 要求ISBNがあるのに別ISBN（または欠落）の本を返す＝黙った版すり替え。高確信を付けず警告する（#1）
  const isbnFallbackMismatch = reqIsbn !== undefined && validation.isbnMatches !== true;
  const confidence: ResolveConfidence = isbnFallbackMismatch
    ? "low"
    : scoreToConfidence(best.matchScore);
  const reason = isbnFallbackMismatch
    ? `要求ISBN ${isbn} は解決できず、書名一致で代替候補を返しています（返却ISBN: ${best.isbn ?? "なし"}）`
    : undefined;
  const ambiguous =
    second !== undefined &&
    best.matchScore < 1 &&
    best.matchScore >= MEDIUM_SCORE &&
    best.matchScore - second.matchScore < AMBIGUOUS_GAP;

  return {
    status: ambiguous ? "ambiguous" : "matched",
    confidence,
    book: stripScore(best),
    matchScore: best.matchScore,
    source: "search",
    validation,
    ...(ambiguous ? { candidates: books.slice(0, 3) } : {}),
    ...(reason ? { reason } : {}),
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
