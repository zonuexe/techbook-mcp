import { startServer } from "./mcp/server.js";
import { DEFAULT_PUBLISHERS } from "./adapters/publishers/registry.js";
import { FetchHttpClient } from "./adapters/http/fetch-client.js";
import { CheerioHtmlParser } from "./adapters/html/cheerio-parser.js";
import { MemoryCacheStore } from "./adapters/cache/memory-cache.js";

const deps = {
  http: new FetchHttpClient(),
  parser: new CheerioHtmlParser(),
  cache: new MemoryCacheStore(),
};

await startServer(DEFAULT_PUBLISHERS, deps);
