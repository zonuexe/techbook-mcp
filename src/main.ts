#!/usr/bin/env node
import { startServer } from "./mcp/server.js";
import { DEFAULT_PUBLISHERS } from "./adapters/publishers/registry.js";
import { makeGoogleBooksAdapter } from "./adapters/publishers/google-books.js";
import { FetchHttpClient } from "./adapters/http/fetch-client.js";
import { CheerioHtmlParser } from "./adapters/html/cheerio-parser.js";
import { MemoryCacheStore } from "./adapters/cache/memory-cache.js";
import { loadCredentials } from "./config/credentials.js";
import { runSetup } from "./setup.js";

const subcommand = process.argv[2];

if (subcommand === "setup") {
  await runSetup();
  process.exit(0);
}

const credentials = await loadCredentials();
const googleBooksApiKey = process.env["GOOGLE_BOOKS_API_KEY"] ?? credentials.googleBooksApiKey ?? "";

const publishers = [
  ...DEFAULT_PUBLISHERS.filter(p => p.id !== "google-books"),
  makeGoogleBooksAdapter(googleBooksApiKey),
];

const deps = {
  http: new FetchHttpClient(),
  parser: new CheerioHtmlParser(),
  cache: new MemoryCacheStore(),
};

await startServer(publishers, deps);
