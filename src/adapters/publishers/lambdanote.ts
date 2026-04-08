import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, resolveUrl, extractAsin } from "./base.js";

const BASE_URL = "https://www.lambdanote.com";

function extractIsbn(text: string): string | undefined {
  const match = text.match(/97[89]-[\d-]{10,}/);
  return match ? match[0].replace(/-/g, "") : undefined;
}

/**
 * Shopify ページに埋め込まれた product JSON を取得する。
 * <script type="application/json" id="ProductJson-..."> または
 * data-product-json 属性を探す。
 */
function parseShopifyProductJson(html: string): Record<string, unknown> | null {
  const match = html.match(
    /<script[^>]+type=["']application\/json["'][^>]*id=["']ProductJson[^"']*["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (match?.[1]) {
    try {
      return JSON.parse(match[1]) as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  return null;
}

export const lambdanoteAdapter: PublisherAdapter = {
  id: "lambdanote",
  name: "ラムダノート",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${BASE_URL}/search?q=${encodeURIComponent(word)}&type=product`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];

    // Shopify Dawn テーマ系の検索結果セレクター
    const items = doc.select(
      ".search-results__list-item, li.search-result-product",
    );

    for (const item of items) {
      const titleEl =
        item.find(".card__heading a")[0] ??
        item.find("h2 a")[0] ??
        item.find("h3 a")[0] ??
        item.find("a.full-unstyled-link")[0];

      if (!titleEl) continue;

      const title = titleEl.text();
      const href = titleEl.attr("href");
      if (!title || !href) continue;

      const bookUrl = resolveUrl(BASE_URL, href);

      const priceEl =
        item.find(".price__regular .price-item")[0] ??
        item.find(".price-item")[0] ??
        item.find(".price")[0];
      const price = priceEl ? parseJapanesePrice(priceEl.text()) : undefined;

      const imgEl = item.find("img")[0];
      const imgSrc = imgEl?.attr("src") ?? imgEl?.attr("data-src");
      const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

      results.push({
        title,
        authors: [],
        publisher: "ラムダノート",
        url: bookUrl,
        price,
        coverImageUrl,
      });
    }

    return results.slice(0, query.limit ?? 10);
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const title =
      doc.selectOne("h1.product__title")?.text() ??
      doc.selectOne("h1")?.text() ??
      "";

    const priceEl =
      doc.selectOne(".price__regular .price-item") ??
      doc.selectOne(".price-item--regular") ??
      doc.selectOne("[class*='price']");
    const price = priceEl ? parseJapanesePrice(priceEl.text()) : undefined;

    const descEl =
      doc.selectOne(".product__description") ??
      doc.selectOne("[class*='description']");
    const description = descEl?.text() || undefined;

    const isbn = extractIsbn(html);
    const asin = extractAsin(html);

    // vendor フィールドに著者が入っている場合がある
    const productJson = parseShopifyProductJson(html);
    const vendor = typeof productJson?.["vendor"] === "string" ? productJson["vendor"] : null;
    const authors: string[] = vendor
      ? vendor.split(/[,、/／]/).map((a: string) => a.trim()).filter(Boolean)
      : [];

    const imgEl =
      doc.selectOne(".product__media img") ??
      doc.selectOne(".product-featured-image") ??
      doc.selectOne("[class*='product'] img");
    const imgSrc = imgEl?.attr("src") ?? imgEl?.attr("data-src");
    const coverImageUrl = imgSrc ? resolveUrl(BASE_URL, imgSrc) : undefined;

    return {
      title,
      authors,
      publisher: "ラムダノート",
      url,
      price,
      description,
      isbn,
      asin,
      coverImageUrl,
    };
  },
};
