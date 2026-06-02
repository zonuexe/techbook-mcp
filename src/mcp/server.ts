import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import type { BookRecord, EbookStore, DrmType, SearchQuery } from "../domain/book.js";
import { searchBooks } from "../application/search-books.js";
import type { SearchError } from "../application/search-books.js";
import { getBookDetail } from "../application/get-book-detail.js";
import { getBookByIsbn } from "../application/get-book-by-isbn.js";
import { looksLikeIsbn } from "../domain/isbn.js";
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

function formatBook(book: BookRecord): Record<string, unknown> {
  if (!book.ebookStores) return book as unknown as Record<string, unknown>;
  return { ...book, ebookStores: book.ebookStores.map(formatEbookStore) };
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

export function createServer(
  publishers: readonly PublisherAdapter[],
  deps: PublisherDeps,
): Server {
  const server = new Server(
    {
      name: "@zonuexe/techbook-mcp",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case "search_books": {
        const title = typeof args["title"] === "string" ? args["title"] : undefined;
        const author = typeof args["author"] === "string" ? args["author"] : undefined;

        // title に ISBN が入力された場合は全社横断せず ISBN 経路へ振り分ける（最短・確実）
        if (title && !author && looksLikeIsbn(title)) {
          const book = await getBookByIsbn(title, publishers, deps);
          const output = { books: [{ ...formatBook(book), matchScore: 1 }] };
          return {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          };
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
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        };
      }

      case "get_book_detail": {
        const url = args["url"];
        if (typeof url !== "string") throw new Error("url は必須です");
        const book = await getBookDetail(url, publishers, deps);
        return {
          content: [{ type: "text", text: JSON.stringify(formatBook(book), null, 2) }],
        };
      }

      case "list_publishers": {
        const list = publishers.map(p => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
        };
      }

      case "get_book_by_isbn": {
        const isbn = args["isbn"];
        if (typeof isbn !== "string") throw new Error("isbn は必須です");
        const book = await getBookByIsbn(isbn, publishers, deps);
        return {
          content: [{ type: "text", text: JSON.stringify(formatBook(book), null, 2) }],
        };
      }

      default:
        throw new Error(`未知のツール: ${name}`);
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
