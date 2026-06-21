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

/** 著者の役割（奥付・ONIX の区別に対応）。判別不能な場合は "author" にフォールバック */
export type ContributorRole = "author" | "translator" | "supervisor" | "editor";

export interface Contributor {
  name: string;
  role: ContributorRole;
}

export interface BookRecord {
  title: string;
  subtitle?: string;        // 副題（ISBD " : " 区切り。openBD 等が併記する場合のみ）
  alternativeTitle?: string; // 並列タイトル（ISBD " = " 区切り。別言語タイトル等。openBD 由来）
  authors: string[];        // 役割を問わない著者名のフラットな配列（後方互換）
  contributors?: Contributor[];  // 役割つきの著者情報（取得できた場合のみ。openBD ONIX 由来など）
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
