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
}
