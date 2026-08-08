import { Server, ProtocolError, INVALID_PARAMS } from "@modelcontextprotocol/server";
import type { CallToolResult, Tool } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import type { BookRecord, EbookStore, DrmType, SearchQuery } from "../domain/book.js";
import { searchBooks } from "../application/search-books.js";
import type { SearchError } from "../application/search-books.js";
import { getBookDetail } from "../application/get-book-detail.js";
import { getBookByIsbn } from "../application/get-book-by-isbn.js";
import { resolveBook, resolveBooks } from "../application/resolve-book.js";
import type { ResolveQuery, ResolveResult } from "../application/resolve-book.js";
import { looksLikeIsbn } from "../domain/isbn.js";
import { collapseWhitespace } from "../domain/title.js";
import { VERSION } from "../version.js";
import { TOOLS } from "./tools.js";

// --- 出力フォーマット ---

const DRM_LABELS: Record<DrmType, string> = {
  free:         "DRMフリー",
  social:       "DRMフリー (ソーシャル)",
  password_pdf: "パスワード付きPDF",
  drm:          "DRM付き",
};

function formatEbookStore(store: EbookStore): Record<string, unknown> {
  return { ...store, drmLabel: DRM_LABELS[store.drm] };
}

export function formatBook(book: BookRecord): Record<string, unknown> {
  // スクレイピング由来の生改行・連続空白が title に残ることがあるため出力境界で畳む（全ソース統一）
  const cleaned: BookRecord = { ...book, title: collapseWhitespace(book.title) };
  if (cleaned.subtitle) cleaned.subtitle = collapseWhitespace(cleaned.subtitle);
  if (!cleaned.ebookStores) return cleaned as unknown as Record<string, unknown>;
  return { ...cleaned, ebookStores: cleaned.ebookStores.map(formatEbookStore) };
}

const ERROR_TYPE_LABELS: Record<SearchError["type"], string> = {
  robots:  "robots.txt によりアクセス禁止",
  timeout: "タイムアウト",
  http:    "HTTPエラー",
  other:   "その他のエラー",
};

/**
 * 出版社ごとのエラーを種別でまとめて静音化する。
 * 18社横断で大量に並ぶ errors を、種別×対象出版社の数件に集約する。
 */
export function summarizeErrors(errors: SearchError[]): Record<string, unknown>[] {
  const byType = new Map<SearchError["type"], string[]>();
  for (const e of errors) {
    const list = byType.get(e.type) ?? [];
    list.push(e.publisherId);
    byType.set(e.type, list);
  }
  return [...byType.entries()].map(([type, publishers]) => ({
    type,
    label: ERROR_TYPE_LABELS[type],
    count: publishers.length,
    publishers,
  }));
}

/** MCP 引数オブジェクトを ResolveQuery に変換する（publisher → publisherId） */
function toResolveQuery(o: Record<string, unknown>): ResolveQuery {
  return {
    isbn: typeof o["isbn"] === "string" ? o["isbn"] : undefined,
    title: typeof o["title"] === "string" ? o["title"] : undefined,
    author: typeof o["author"] === "string" ? o["author"] : undefined,
    publisherId: typeof o["publisher"] === "string" ? o["publisher"] : undefined,
  };
}

/** 解決結果内の book / candidates を出力フォーマットに通す */
function formatResolveResult(result: ResolveResult): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...result,
    book: result.book ? formatBook(result.book) : null,
  };
  if (result.candidates) out["candidates"] = result.candidates.map(formatBook);
  return out;
}

export function createServer(
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Server {
  const server = new Server(
    {
      name: "@zonuexe/techbook-mcp",
      version: VERSION,
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.setRequestHandler("tools/list", async () => ({
    tools: TOOLS,
  }));

  /**
   * content（従来のJSON文字列表現）と structuredContent（構造化データ）の両方を積んで返す。
   * projectCallToolResult が outputSchema のルート型に応じて 2025-era 向けの
   * `{result: ...}` ラップを要否判定する（配列ルート等は 2025-era では自動ラップされる）。
   */
  function respond(data: unknown, outputSchema: Tool["outputSchema"]): CallToolResult {
    return server.projectCallToolResult(
      { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data },
      outputSchema,
    );
  }

  server.setRequestHandler("tools/call", async (request) => {
    const { name, arguments: args = {} } = request.params;
    const outputSchema = TOOLS.find(t => t.name === name)?.outputSchema;

    switch (name) {
      case "search_books": {
        const title = typeof args["title"] === "string" ? args["title"] : undefined;
        const author = typeof args["author"] === "string" ? args["author"] : undefined;

        // title に ISBN が入力された場合は全社横断せず ISBN 経路へ振り分ける（最短・確実）
        if (title && !author && looksLikeIsbn(title)) {
          const book = await getBookByIsbn(title, publishers, deps);
          const output = { books: [{ ...formatBook(book), matchScore: 1 }] };
          return respond(output, outputSchema);
        }

        const query: SearchQuery = {
          title,
          author,
          publisherId: typeof args["publisher"] === "string" ? args["publisher"] : undefined,
          limit: typeof args["limit"] === "number" ? Math.min(args["limit"], 50) : 10,
        };
        const { books, errors } = await searchBooks(query, publishers, deps);
        const output: Record<string, unknown> = { books: books.map(formatBook) };
        if (errors.length > 0) output["errors"] = summarizeErrors(errors);
        return respond(output, outputSchema);
      }

      case "get_book_detail": {
        const url = args["url"];
        if (typeof url !== "string") throw new ProtocolError(INVALID_PARAMS, "url は必須です");
        const book = await getBookDetail(url, publishers, deps);
        return respond(formatBook(book), outputSchema);
      }

      case "list_publishers": {
        const list = publishers.map(p => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
        }));
        return respond(list, outputSchema);
      }

      case "get_book_by_isbn": {
        const isbn = args["isbn"];
        if (typeof isbn !== "string") throw new ProtocolError(INVALID_PARAMS, "isbn は必須です");
        const book = await getBookByIsbn(isbn, publishers, deps);
        return respond(formatBook(book), outputSchema);
      }

      case "resolve_book": {
        const result = await resolveBook(toResolveQuery(args), publishers, deps);
        return respond(formatResolveResult(result), outputSchema);
      }

      case "resolve_books": {
        const booksArg = args["books"];
        if (!Array.isArray(booksArg)) throw new ProtocolError(INVALID_PARAMS, "books は配列で指定してください");
        const queries = booksArg.map(b => toResolveQuery((b ?? {}) as Record<string, unknown>));
        const results = await resolveBooks(queries, publishers, deps);
        return respond({ results: results.map(formatResolveResult) }, outputSchema);
      }

      default:
        throw new ProtocolError(INVALID_PARAMS, `未知のツール: ${name}`);
    }
  });

  return server;
}

export async function startServer(
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Promise<void> {
  const server = createServer(publishers, deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
