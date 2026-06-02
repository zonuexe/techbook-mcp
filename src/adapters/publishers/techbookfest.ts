import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, extractEbookStoresFromDoc } from "./base.js";
import { VERSION } from "../../version.js";

const BASE_URL = "https://techbookfest.org";
const GRAPHQL_URL = `${BASE_URL}/api/graphql`;
const XSRF_CACHE_KEY = "techbookfest:xsrf-token";
const XSRF_TTL_SECONDS = 3600;

const DEFAULT_HEADERS = {
  "User-Agent": `techbook-mcp/${VERSION} (+https://github.com/zonuexe/techbook-mcp; bibliographic search bot)`,
  "Accept": "application/json",
};

// node.product は ProductInfoSearchResult のインラインフラグメント経由でアクセスする
const SEARCH_QUERY = `
query MarketSearchQuery($query: String!, $first: Int!) {
  searchProducts(first: $first, query: $query, orderBy: CREATED_AT_DESC) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        ... on ProductInfoSearchResult {
          product {
            id
            databaseID
            name
            description
            organization { name }
            coverImage { url }
            ebookVariant: productVariant(kind: MARKET_EBOOK) { price }
            firstPublishedAt
            status
          }
        }
      }
    }
  }
}
`.trim();

interface TechbookfestProduct {
  id: string;
  databaseID: string;
  name: string;
  description: string | null;
  organization: { name: string } | null;
  coverImage: { url: string } | null;
  ebookVariant: { price: number } | null;
  firstPublishedAt: string | null;
  status: string;
}

interface GraphQLResponse {
  data?: {
    searchProducts?: {
      edges: Array<{ node: { product?: TechbookfestProduct } }>;
    };
  };
}

/**
 * トップページの Set-Cookie から XSRF-TOKEN を取得してキャッシュする。
 * 技術書典の GraphQL API は XSRF トークンを Cookie + X-XSRF-TOKEN ヘッダーの
 * ダブルサブミット方式で検証する。
 */
async function fetchXsrfToken(deps: PublisherDeps): Promise<string> {
  const cached = await deps.cache.get(XSRF_CACHE_KEY);
  if (cached !== null) return cached;

  const response = await deps.http.get(BASE_URL, { headers: DEFAULT_HEADERS });
  const setCookie = response.header("set-cookie") ?? "";

  // Set-Cookie: XSRF-TOKEN=<urlencoded-value>; Path=/; Secure; SameSite=Lax
  const match = setCookie.match(/XSRF-TOKEN=([^;,\s]+)/);
  if (!match) throw new Error("techbookfest: XSRF-TOKEN not found in Set-Cookie");

  const token = decodeURIComponent(match[1]);
  await deps.cache.set(XSRF_CACHE_KEY, token, XSRF_TTL_SECONDS);
  return token;
}

function productToBookRecord(product: TechbookfestProduct): BookRecord {
  const url = `${BASE_URL}/product/${product.databaseID}`;
  const publishedAt = product.firstPublishedAt
    ? product.firstPublishedAt.slice(0, 10)
    : undefined;

  return {
    title: product.name,
    authors: product.organization ? [product.organization.name] : [],
    publisher: "技術書典",
    url,
    price: product.ebookVariant?.price,
    description: product.description ?? undefined,
    coverImageUrl: product.coverImage?.url,
    publishedAt,
    ebookStores: [{ name: "技術書典", url, drm: "free" }],
  };
}

export const techbookfestAdapter: PublisherAdapter = {
  id: "techbookfest",
  name: "技術書典オンラインマーケット",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const limit = query.limit ?? 10;
    const xsrf = await fetchXsrfToken(deps);

    const body = JSON.stringify({
      operationName: "MarketSearchQuery",
      query: SEARCH_QUERY,
      variables: { query: word, first: limit },
    });

    const response = await deps.http.post(GRAPHQL_URL, body, {
      headers: {
        ...DEFAULT_HEADERS,
        "Content-Type": "application/json",
        "Cookie": `XSRF-TOKEN=${encodeURIComponent(xsrf)}`,
        "X-XSRF-TOKEN": xsrf,
      },
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${GRAPHQL_URL}`);
    }

    const json = JSON.parse(await response.text()) as GraphQLResponse;
    const edges = json.data?.searchProducts?.edges ?? [];

    return edges
      .map(e => e.node.product)
      .filter((p): p is TechbookfestProduct => p != null)
      .slice(0, limit)
      .map(productToBookRecord);
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const title =
      doc.selectOne('meta[property="og:title"]')?.attr("content") ??
      doc.selectOne("h1")?.text() ??
      "";

    const description =
      doc.selectOne('meta[property="og:description"]')?.attr("content") ??
      doc.selectOne('meta[name="description"]')?.attr("content") ??
      undefined;

    const coverImageUrl =
      doc.selectOne('meta[property="og:image"]')?.attr("content") ??
      undefined;

    const priceText = doc.selectOne('[class*="price"]')?.text();
    const price = priceText ? parseJapanesePrice(priceText) : undefined;

    const ebookStores = extractEbookStoresFromDoc(doc);
    if (!ebookStores.some(s => s.name === "技術書典")) {
      ebookStores.unshift({ name: "技術書典", url, drm: "free" });
    }

    return {
      title,
      authors: [],
      publisher: "技術書典",
      url,
      price,
      description,
      coverImageUrl,
      ebookStores,
    };
  },
};
