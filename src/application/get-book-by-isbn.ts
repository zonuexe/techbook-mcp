import type { BookRecord } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import { checkRobotsTxt } from "../adapters/publishers/base.js";
import { fetchOpenBDBooks, openBDEntryToBookRecord } from "../adapters/openbd.js";
import { fetchCalilBook } from "../adapters/calil.js";
import { findAdapterIdByIsbn } from "../adapters/publishers/isbn-publisher-codes.js";
import { dedupeAuthors } from "../domain/authors.js";

/**
 * ISBNから書籍情報を取得する。
 *
 * 1. openBD で書誌情報と出版社ストアリンクを取得する
 * 2. ストアリンクが既知アダプターと一致する場合は出版社サイトから詳細取得を試みる
 * 3. ISBN出版者記号から対応アダプターを特定し、出版社サイトで検索して詳細取得を試みる
 * 4. 取得できない場合は openBD データをそのまま返す
 * 5. openBD にも存在しない場合:
 *    a. ISBN から詳細URLを決定的に引けるアダプター（detailUrlForIsbn）で詳細取得を試みる
 *       （O'Reilly の電子書籍専売・販売終了の旧刊救済。openBD/カーリル未収録のため）
 *    b. それも不可ならカーリルから書誌情報を取得する（廃業出版社など）
 */

/**
 * ISBN出版者記号からアダプターを特定し、detailUrlForIsbn で構成した詳細ページから直接取得する。
 * openBD・カーリル・検索一覧いずれにも出ない旧刊（販売終了・電子書籍専売）の救済経路。
 * 取得できなければ undefined を返す。
 */
async function fetchDetailByIsbnCode(
  isbn: string,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<BookRecord | undefined> {
  const adapterId = findAdapterIdByIsbn(isbn);
  if (!adapterId) return undefined;

  const publisher = publishers.find(p => p.id === adapterId);
  const url = publisher?.detailUrlForIsbn?.(isbn);
  if (!publisher || !url) return undefined;

  if (!(await checkRobotsTxt(url, deps))) return undefined;
  try {
    const book = await publisher.getDetail(url, deps);
    book.language ??= publisher.language ?? "ja";
    return book;
  } catch {
    return undefined;
  }
}
/** ISBN 解決の取得元 */
export type IsbnSource = "isbn:openbd" | "isbn:publisher" | "isbn:calil";

export interface IsbnResolution {
  book: BookRecord;
  source: IsbnSource;
}

/**
 * ISBN から書誌情報を解決し、取得元（source）付きで返す。見つからなければ null。
 * 経路は上記 docstring の 1〜5 の順。
 */
export async function resolveByIsbn(
  isbn: string,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<IsbnResolution | null> {
  const normalizedIsbn = isbn.replace(/-/g, "");

  // 言語の既定を刻み、著者の重複を除く（openBD/カーリル/国内出版社はいずれも日本語）
  const stamp = (book: BookRecord, lang = "ja"): BookRecord => {
    book.language ??= lang;
    book.authors = dedupeAuthors(book.authors);
    return book;
  };

  const openBDMap = await fetchOpenBDBooks([normalizedIsbn], deps);
  const entry = openBDMap.get(normalizedIsbn);

  if (!entry) {
    // openBD 未収録でも、ISBN から詳細URLを決定的に引けるアダプター（O'Reilly 旧刊等）を先に試す
    const byAdapter = await fetchDetailByIsbnCode(normalizedIsbn, publishers, deps);
    if (byAdapter) return { book: stamp(byAdapter), source: "isbn:publisher" };
    // それも不可ならカーリルをフォールバックとして試みる（廃業出版社など）
    const calilBook = await fetchCalilBook(normalizedIsbn, deps);
    if (calilBook) return { book: stamp(calilBook), source: "isbn:calil" };
    return null;
  }

  // hanmoto.storelink が既知アダプターの baseUrl と前方一致する場合は
  // 出版社サイトから詳細取得を試みる
  const storelink = entry.hanmoto?.storelink;
  if (storelink) {
    const publisher = publishers.find(p => storelink.startsWith(p.baseUrl));
    if (publisher) {
      const allowed = await checkRobotsTxt(storelink, deps);
      if (allowed) {
        try {
          return {
            book: stamp(await publisher.getDetail(storelink, deps), publisher.language ?? "ja"),
            source: "isbn:publisher",
          };
        } catch {
          // 出版社サイトからの取得失敗は無視して次のフォールバックへ
        }
      }
    }
  }

  // ISBN出版者記号から対応アダプターを特定し、出版社サイトで検索する
  const adapterId = findAdapterIdByIsbn(normalizedIsbn);
  if (adapterId) {
    const publisher = publishers.find(p => p.id === adapterId);
    if (publisher) {
      try {
        const results = await publisher.search({ title: normalizedIsbn, limit: 5 }, deps);
        const matched = results.find(r => r.isbn && r.isbn.replace(/-/g, "") === normalizedIsbn)
          ?? results[0];
        if (matched) return { book: stamp(matched, publisher.language ?? "ja"), source: "isbn:publisher" };
      } catch {
        // 出版社サイトからの取得失敗は無視して openBD データで返す
      }
    }
  }

  return { book: stamp(openBDEntryToBookRecord(entry)), source: "isbn:openbd" };
}

export async function getBookByIsbn(
  isbn: string,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<BookRecord> {
  const resolved = await resolveByIsbn(isbn, publishers, deps);
  if (!resolved) throw new Error(`書誌情報が見つかりません: ${isbn}`);
  return resolved.book;
}
