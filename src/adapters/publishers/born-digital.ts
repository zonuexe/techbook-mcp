import type { PublisherAdapter, PublisherDeps } from "../../domain/publisher.js";
import type { BookRecord, SearchQuery } from "../../domain/book.js";
import { fetchText, parseJapanesePrice, resolveUrl, encodeEucJp, parseJapaneseDateToISO } from "./base.js";

const BASE_URL = "https://wgn-obs.shop-pro.jp";

/**
 * 商品説明テキストから著者・出版社・発売日を取得する。
 * 以下の2形式に対応:
 *   - "著者\tヘイドン・ピカリング<br />" (タブ区切り)
 *   - "著者：太田 良典、中村 直樹<br />" (全角コロン区切り)
 */
function parseDescription(text: string): {
  authors: string[];
  publisher: string;
  publishedAt: string | undefined;
} {
  const authors: string[] = [];
  let publisher = "ボーンデジタル";
  let publishedAt: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^(.+?)[\t：]\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();

    if (key === "著者" || key === "著") {
      authors.push(...value.split(/[、，,]/).map(s => s.trim()).filter(Boolean));
    } else if (key === "翻訳" || key === "翻訳者" || key === "訳者" || key === "訳") {
      authors.push(...value.split(/[、，,]/).map(s => s.trim()).filter(Boolean));
    } else if (key.startsWith("発行") || key === "発売") {
      publisher = value.replace(/^株式会社\s*/, "").replace(/\s*株式会社$/, "").trim();
    } else if (key === "発売日") {
      publishedAt = parseJapaneseDateToISO(value);
    }
  }

  return { authors, publisher, publishedAt };
}

/**
 * ページ埋め込みの Colorme JSON から商品情報を取得する。
 * `var Colorme = {...};` 形式。
 */
function extractColormeProduct(html: string): { price?: number } {
  const m = html.match(/var Colorme = (\{[^\n]+\});/);
  if (!m) return {};
  try {
    const data = JSON.parse(m[1]) as {
      product?: { sales_price_including_tax?: number };
    };
    const price = data.product?.sales_price_including_tax;
    return { price };
  } catch {
    return {};
  }
}

export const bornDigitalAdapter: PublisherAdapter = {
  id: "born-digital",
  name: "ボーンデジタル",
  baseUrl: BASE_URL,

  async search(query: SearchQuery, deps: PublisherDeps): Promise<BookRecord[]> {
    const word = [query.title, query.author].filter(Boolean).join(" ");
    if (!word) return [];

    const url = `${BASE_URL}/?mode=srh&keyword=${encodeEucJp(word)}`;
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    const results: BookRecord[] = [];
    const limit = query.limit ?? 10;

    for (const item of doc.select("li.c-product-list__item")) {
      const titleEl = item.find("a.c-product-list__name")[0];
      const title = titleEl?.text().trim();
      if (!title) continue;

      // 電子書籍のみ: タイトルが【電子書籍版】または【PDFダウンロード版】で始まる
      if (!title.startsWith("【")) continue;

      const href = item.find("a.c-product-list__image-wrap")[0]?.attr("href")
        ?? titleEl?.attr("href");
      if (!href) continue;
      const bookUrl = resolveUrl(BASE_URL + "/", href);

      const priceText = item.find(".c-product-list__price")[0]?.text();
      const price = priceText ? parseJapanesePrice(priceText) : undefined;

      const imgEl = item.find("a.c-product-list__image-wrap img.c-image-box__image")[0];
      const coverImageUrl = imgEl?.attr("src") ?? undefined;

      results.push({
        title,
        authors: [],
        publisher: "ボーンデジタル",
        url: bookUrl,
        price,
        coverImageUrl,
        ebookStores: [{ name: "ボーンデジタル", url: bookUrl, drm: "social" }],
      });

      if (results.length >= limit) break;
    }

    return results;
  },

  async getDetail(url: string, deps: PublisherDeps): Promise<BookRecord> {
    const html = await fetchText(url, deps);
    const doc = deps.parser.parse(html);

    // Colorme JSON から価格を取得
    const { price: colormePrice } = extractColormeProduct(html);

    const title = doc.selectOne(".p-cart-form__name")?.text().trim()
      ?? doc.selectOne(".p-product-body__name")?.text().trim()
      ?? "";

    const priceText = doc.selectOne(".c-product-info__price")?.text();
    const price = colormePrice ?? (priceText ? parseJapanesePrice(priceText) : undefined);

    const descText = doc.selectOne(".p-product-body__description")?.text() ?? "";
    const { authors, publisher, publishedAt } = parseDescription(descText);

    const imgEl = doc.selectOne(".p-large-image img");
    const coverImageUrl = imgEl?.attr("src") ?? undefined;

    return {
      title,
      authors,
      publisher,
      url,
      price,
      publishedAt,
      coverImageUrl,
      ebookStores: [{ name: "ボーンデジタル", url, drm: "social" }],
    };
  },
};
