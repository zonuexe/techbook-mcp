import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { PublisherAdapter, PublisherDeps } from "../domain/publisher.js";
import type { BookRecord, EbookStore, DrmType, SearchQuery } from "../domain/book.js";
import { searchBooks } from "../application/search-books.js";
import { getBookDetail } from "../application/get-book-detail.js";
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
        const query: SearchQuery = {
          title: typeof args["title"] === "string" ? args["title"] : undefined,
          author: typeof args["author"] === "string" ? args["author"] : undefined,
          publisherId: typeof args["publisher"] === "string" ? args["publisher"] : undefined,
          limit: typeof args["limit"] === "number" ? Math.min(args["limit"], 50) : 10,
        };
        const { books, errors } = await searchBooks(query, publishers, deps);
        const output: Record<string, unknown> = { books: books.map(formatBook) };
        if (errors.length > 0) output["errors"] = errors;
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
