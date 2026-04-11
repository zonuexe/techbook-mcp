import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, encodeEucJp } from "./base.js";

const BASE_URL = "https://shop.rutles.net";

/**
 * "著者: 大槻有一郎:著　山田巧(DXライブラリ管理人):監修<br />"
 * から著者名のリストを取得する。
 * - 役割語（:著 / :訳 / :監修 など ":"以降）を除去
 * - 所属（括弧内）を除去
 * - 全角スペースで複数著者を分割
 */
function parseAuthorsFromBodyText(bodyText: string): string[] {
  const m = bodyText.match(/著者[：:]\s*([^\n<]+)/);
  if (!m) return [];
  return m[1]
    .split(/[\u3000　]/)           // 全角スペースで分割
    .map(part =>
      part
        .replace(/\(.*?\)/g, "")   // (所属) を除去
        .replace(/:.*$/, "")       // :役割語 を除去
        .trim(),
    )
    .filter(Boolean);
}

/**
 * "発売日:2014年10月25日" → "2014-10-25"
 */
function parseDateFromBodyText(bodyText: string): string | undefined {
  const m = bodyText.match(/発売日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/**
 * ページ埋め込みの Colorme JSON から商品情報を取得する。
 * `var Colorme = {...};` 形式。
 */
function extractColormeProduct(html: string): { isbn?: string; price?: number } {
  const m = html.match(/var Colorme = (\{[^\n]+\});/);
  if (!m) return {};
  try {
    const data = JSON.parse(m[1]) as {
      product?: { model_number?: string; sales_price_including_tax?: number };
    };
    const product = data.product;
    if (!product) return {};
    const rawIsbn = product.model_number;
    const isbn = rawIsbn ? rawIsbn.replace(/-/g, "") : undefined;
    const price = product.sales_price_including_tax;
    return { isbn, price };
  } catch {
    return {};
  }
}

export const rutlesAdapter: PublisherAdapter = {
  id: "rutles",
  name: "ラトルズ",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${BASE_URL}/?mode=srh&keyword=${encodeEucJp(word)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const item of doc.select("li.c-item-list__item")) {
      const linkEl = item.find("div.c-item-list__ttl a")[0];
      if (!linkEl) continue;

      const title = linkEl.text().trim();
      const href = linkEl.attr("href");
      if (!title || !href) continue;

      // 【電子版】 が含まれるもののみ対象
      if (!title.includes("【電子版】")) continue;

      // `?pid=...` 形式の相対URLを `https://shop.rutles.net/?pid=...` に変換
      const bookUrl = new URL(href, BASE_URL + "/").toString();

      const priceText = item.find("div.c-item-list__price")[0]?.text().trim();
      const price = priceText ? parseJapanesePrice(priceText) : undefined;

      const imgEl = item.find("div.c-item-list__img img")[0];
      const coverImageUrl = imgEl?.attr("src") ?? undefined;

      results.push({
        title,
        authors: [],
        publisher: "ラトルズ",
        url: bookUrl,
        price,
        coverImageUrl,
        ebookStores: [{ name: "ラトルズ", url: bookUrl, drm: "free" }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const getMeta = (prop: string): string | undefined =>
      doc.selectOne(`meta[property="${prop}"]`)?.attr("content")?.trim() || undefined;

    // タイトル: h2.p-product-info__ttl または og:title から " - ..." を除去
    const h2Title = doc.selectOne("h2.p-product-info__ttl")?.text().trim();
    const ogTitle = getMeta("og:title")?.replace(/\s*[-－]\s*出版社ラトルズ公式ネットショップ.*$/, "").trim();
    const title = h2Title || ogTitle || "";

    // 説明文テキストから著者・発売日を取得
    const bodyText = doc.selectOne("div.p-product-explain__body")?.text() ?? "";
    const authors = parseAuthorsFromBodyText(bodyText);
    const publishedAt = parseDateFromBodyText(bodyText);

    // Colorme JSON から ISBN・価格を取得
    const { isbn, price: colormePrice } = extractColormeProduct(html);

    // og:price をフォールバックとして使用
    const metaPriceStr = getMeta("product:price:amount");
    const price = colormePrice ?? (metaPriceStr ? parseInt(metaPriceStr, 10) : undefined);

    const coverImageUrl = getMeta("og:image") ?? undefined;

    return {
      title,
      authors,
      publisher: "ラトルズ",
      url,
      isbn,
      price,
      publishedAt,
      coverImageUrl,
      ebookStores: [{ name: "ラトルズ", url, drm: "free" }],
    };
  },
};
