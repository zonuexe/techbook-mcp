export type DrmType = "free" | "drm";

export interface EbookStore {
  name: string;
  url: string;
  drm: DrmType;
}

export interface BookRecord {
  title: string;
  authors: string[];
  publisher: string;
  publishedAt?: string;   // "YYYY-MM-DD"
  isbn?: string;          // ISBN-13、ハイフンなし数字のみ
  asin?: string;          // Amazon ASIN (Amazonリンクが存在する場合)
  url: string;            // 出版社公式ページURL
  price?: number;         // 税込価格（円）
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
