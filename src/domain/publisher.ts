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
  search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]>;
  getDetail(url: string, deps: PublisherDeps): Promise<BookRecord>;
}
