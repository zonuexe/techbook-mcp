import type { BookRecord, SearchQuery } from "./book.js";
import type { HttpClient } from "../ports/http.js";
import type { HtmlParser } from "../ports/html-parser.js";
import type { CacheStore } from "../ports/cache.js";

export interface PublisherDeps {
  http: HttpClient;
  parser: HtmlParser;
  cache: CacheStore;
}

export interface PublisherAdapter {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  /** この出版社の書籍の既定言語（ISO 639-1）。省略時はアプリ層で "ja" とみなす */
  readonly language?: string;
  /**
   * 検索時のスケジューリング/キャッシュ戦略のヒント。
   * - 省略 = 大規模出版社（優先的にスケジュールし、通常 TTL でキャッシュ）
   * - "minor" = 小規模・専門/ローカルフィルタ型（大規模の後に回し、カタログを長 TTL で全キャッシュ）
   */
  readonly scale?: "minor";
  search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]>;
  getDetail(url: string, deps: PublisherDeps): Promise<BookRecord>;
  /**
   * ISBN から詳細ページの URL を決定的に構成できるアダプター向け（任意）。
   * 詳細ページが ISBN ベースの安定 URL を持つサイト（例 O'Reilly の `/books/{isbn}/`）で実装する。
   * openBD・カーリル未収録かつ検索一覧にも出ない旧刊（販売終了・電子書籍専売）を
   * `get_book_by_isbn` のフォールバックで直接引くために使う（[[docs/design-doc.md「カバレッジの制約」]]）。
   * URL を構成できない ISBN は undefined を返す。
   */
  detailUrlForIsbn?(isbn: string): string | undefined;
}
