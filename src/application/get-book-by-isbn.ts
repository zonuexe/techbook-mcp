import type { BookRecord } from "../domain/book.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import { checkRobotsTxt } from "../adapters/publishers/base.js";
import { fetchOpenBDBooks, openBDEntryToBookRecord } from "../adapters/openbd.js";

/**
 * ISBNから書籍情報を取得する。
 *
 * 1. openBD で書誌情報と出版社ストアリンクを取得する
 * 2. ストアリンクが既知アダプターと一致する場合は出版社サイトから詳細取得を試みる
 * 3. 取得できない場合は openBD データをそのまま返す
 */
export async function getBookByIsbn(
  isbn: string,
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<BookRecord> {
  const normalizedIsbn = isbn.replace(/-/g, "");

  const openBDMap = await fetchOpenBDBooks([normalizedIsbn], deps);
  const entry = openBDMap.get(normalizedIsbn);

  if (!entry) {
    throw new Error(`openBDに書誌情報が見つかりません: ${isbn}`);
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
          return await publisher.getDetail(storelink, deps);
        } catch {
          // 出版社サイトからの取得失敗は無視して openBD データで返す
        }
      }
    }
  }

  return openBDEntryToBookRecord(entry);
}
