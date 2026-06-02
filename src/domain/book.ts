/**
 * - `"free"`         : 技術的DRMなし (DRM-free PDF/EPUB)
 * - `"social"`       : ソーシャルDRM (購入者情報を透かし刻印、技術的制限なし)
 * - `"password_pdf"` : パスワード認証付きPDF (標準PDFビューアで閲覧可、パスワード必須)
 * - `"drm"`          : 技術的DRM付き (専用ビューアー必須)
 */
export type DrmType = "free" | "social" | "password_pdf" | "drm";

export interface EbookStore {
  name: string;
  url: string;
  drm: DrmType;
}

export interface BookRecord {
  title: string;
  authors: string[];
  publisher: string;
  publishedAt?: string;   // "YYYY-MM-DD"（riida-mcp の release_date に対応）
  language?: string;      // ISO 639-1 言語コード（省略時は "ja" とみなす）
  isbn?: string;          // ISBN-13、ハイフンなし数字のみ
  asin?: string;          // Amazon ASIN (Amazonリンクが存在する場合)
  url: string;            // 出版社公式ページURL
  price?: number;         // 価格（currency の単位。省略時は税込円・整数）
  currency?: string;      // ISO 4217 通貨コード（省略時は "JPY" とみなす。海外出版社用）
  coverImageUrl?: string;
  description?: string;
  tags?: string[];
  ebookStores?: EbookStore[];
}

export interface SearchQuery {
  title?: string;
  author?: string;
  publisherId?: string;  // 出版社IDでフィルタ (例: "gihyo", "lambdanote")
  limit?: number;        // デフォルト: 10
}
