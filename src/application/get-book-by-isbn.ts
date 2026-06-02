import type { BookRecord } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import { checkRobotsTxt } from "../adapters/publishers/base.js";
import { fetchOpenBDBooks, openBDEntryToBookRecord } from "../adapters/openbd.js";
import { fetchCalilBook } from "../adapters/calil.js";
import { findAdapterIdByIsbn } from "../adapters/publishers/isbn-publisher-codes.js";

/**
 * ISBNから書籍情報を取得する。
 *
 * 1. openBD で書誌情報と出版社ストアリンクを取得する
 * 2. ストアリンクが既知アダプターと一致する場合は出版社サイトから詳細取得を試みる
 * 3. ISBN出版者記号から対応アダプターを特定し、出版社サイトで検索して詳細取得を試みる
 * 4. 取得できない場合は openBD データをそのまま返す
 * 5. openBD にも存在しない場合はカーリルから書誌情報を取得する（廃業出版社など）
 */
export async function getBookByIsbn(
  isbn: string,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<BookRecord> {
  const normalizedIsbn = isbn.replace(/-/g, "");

  // 言語が未設定の書籍に既定言語を刻む（openBD/カーリル/国内出版社はいずれも日本語）
  const stamp = (book: BookRecord, lang = "ja"): BookRecord => {
    book.language ??= lang;
    return book;
  };

  const openBDMap = await fetchOpenBDBooks([normalizedIsbn], deps);
  const entry = openBDMap.get(normalizedIsbn);

  if (!entry) {
    // openBD にない場合はカーリルをフォールバックとして試みる（廃業出版社など）
    const calilBook = await fetchCalilBook(normalizedIsbn, deps);
    if (calilBook) return stamp(calilBook);
    throw new Error(`書誌情報が見つかりません: ${isbn}`);
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
          return stamp(await publisher.getDetail(storelink, deps), publisher.language ?? "ja");
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
        if (matched) return stamp(matched, publisher.language ?? "ja");
      } catch {
        // 出版社サイトからの取得失敗は無視して openBD データで返す
      }
    }
  }

  return stamp(openBDEntryToBookRecord(entry));
}
