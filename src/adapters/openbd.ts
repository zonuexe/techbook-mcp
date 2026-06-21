import type { PublisherDeps } from "../domain/publisher.js";
import type { BookRecord, Contributor, ContributorRole } from "../domain/book.js";
import { fetchText, stripAuthorRole } from "./publishers/base.js";
import { dedupeAuthors } from "../domain/authors.js";
import { parseBibliographicTitle } from "../domain/title.js";

/**
 * openBD の summary.author（"結城浩／著、北原かな／訳" 等）を著者名配列に分解する。
 * 区切りで分割し、役割語（著・訳など）を除去して重複を除く。
 * ONIX の構造化 contributor が無い場合のフォールバック。
 */
function parseOpenBDAuthors(author: string | undefined): string[] {
  if (!author) return [];
  const parts = author
    .split(/[/／、,，]/)
    .map(a => stripAuthorRole(a.trim()))
    .filter(Boolean);
  return dedupeAuthors(parts);
}

/** ONIX List 17 の contributor role コード → 役割 */
const ONIX_ROLE_MAP: Record<string, ContributorRole> = {
  A01: "author",      // By (author) 著
  B06: "translator",  // Translated by 訳
  B01: "editor",      // Edited by 編
  B21: "editor",      // Edited by（別表記）
  B13: "supervisor",  // 監修相当
};

/**
 * ONIX PersonName.content を表示名に整形する。
 *
 * 図書館見出し形式 "姓, 名" および生年つきの "姓, 名, 1983-" に対応する
 * （後者はカンマ3分割になるため、先頭2要素＝姓名のみ採用し生年は捨てる）。
 * 西洋名（ASCII）は "First Last" に入れ替え、和名は "姓 名" にする。
 * カンマを含まない（既に表示名の）場合はそのまま空白を畳んで返す。
 */
function formatPersonName(content: string): string {
  const name = content.trim();
  if (!name) return "";
  const parts = name.split(/,\s*/);
  if (parts.length < 2) return name.replace(/\s+/g, " ");
  const [last, first] = parts;  // 3要素目以降（生年・没年）は無視
  // eslint-disable-next-line no-control-regex
  const isAscii = /^[\x00-\x7F]+$/.test(`${last}${first}`);
  return isAscii ? `${first} ${last}` : `${last} ${first}`;
}

/**
 * ONIX DescriptiveDetail.Contributor から役割つきの著者情報を取り出す。
 * summary.author（生年・出版社が混入しがち）より信頼できる。
 */
function parseContributors(entry: OpenBDEntry): Contributor[] {
  const list = entry.onix.DescriptiveDetail?.Contributor;
  if (!list || list.length === 0) return [];
  const ordered = [...list].sort(
    (a, b) => Number(a.SequenceNumber ?? 0) - Number(b.SequenceNumber ?? 0),
  );
  const out: Contributor[] = [];
  for (const c of ordered) {
    const name = formatPersonName(c.PersonName?.content ?? "");
    if (!name) continue;
    const code = c.ContributorRole?.find(Boolean);
    const role: ContributorRole = (code && ONIX_ROLE_MAP[code]) || "author";
    out.push({ name, role });
  }
  return out;
}

/** entry から著者名のフラット配列を得る（contributor 優先、無ければ summary.author） */
function authorsFromEntry(entry: OpenBDEntry): string[] {
  const contributors = parseContributors(entry);
  if (contributors.length > 0) return dedupeAuthors(contributors.map(c => c.name));
  return parseOpenBDAuthors(entry.summary.author);
}

const OPENBD_API_URL = "https://api.openbd.jp/v1/get";

// --- 型定義 ---

interface OpenBDSummary {
  isbn: string;
  title: string;
  publisher: string;
  pubdate: string;   // "YYYYMMDD"
  cover: string;     // "https://cover.openbd.jp/{isbn}.jpg"
  author: string;
}

interface OpenBDTextContent {
  TextType: string;  // "02": 短い説明, "03": 説明文, "04": 目次
  ContentAudience: string;
  Text: string;
}

interface OpenBDPrice {
  PriceType: string;    // "03": 税込定価
  PriceAmount: string;
  CurrencyCode: string;
}

interface OpenBDHanmoto {
  isbn: string;
  storelink?: string;
  [key: string]: unknown;
}

interface OpenBDContributor {
  SequenceNumber?: string;
  ContributorRole?: string[];
  PersonName?: { content?: string; collationkey?: string };
}

export interface OpenBDEntry {
  summary: OpenBDSummary;
  hanmoto?: OpenBDHanmoto;
  onix: {
    DescriptiveDetail?: {
      Contributor?: OpenBDContributor[];
    };
    CollateralDetail?: {
      TextContent?: OpenBDTextContent[];
    };
    ProductSupply?: {
      SupplyDetail?: {
        Price?: OpenBDPrice[];
      };
    };
  };
}

// --- ユーティリティ ---

/**
 * openBD の pubdate（"YYYYMMDD" / "YYYYMM" / "YYYY"）を "YYYY-MM-DD" に正規化する。
 * 月精度（6桁）は月初 "-01" を補う（personal-media アダプタと同方針）。
 * 年精度（4桁）以下は日付として確定できないため undefined を返す。
 */
function parsePubDate(pubdate: string): string | undefined {
  const digits = (pubdate ?? "").replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length === 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-01`;
  }
  return undefined;
}

function findTextByType(entry: OpenBDEntry, ...types: string[]): string | undefined {
  const texts = entry.onix.CollateralDetail?.TextContent;
  if (!texts) return undefined;
  for (const type of types) {
    const found = texts.find(t => t.TextType === type);
    if (found?.Text) return found.Text;
  }
  return undefined;
}

function getTaxIncludedPrice(entry: OpenBDEntry): number | undefined {
  const prices = entry.onix.ProductSupply?.SupplyDetail?.Price;
  if (!prices) return undefined;
  // PriceType "03" = 税込定価
  const price = prices.find(p => p.PriceType === "03");
  if (!price) return undefined;
  const amount = parseInt(price.PriceAmount, 10);
  return isNaN(amount) ? undefined : amount;
}

// --- 公開API ---

/**
 * openBD API から複数ISBNの書誌情報を一括取得する。
 * @returns ISBNをキーとするMapを返す。該当なし・取得失敗のISBNは含まれない。
 */
export async function fetchOpenBDBooks(
  isbns: string[],
  deps: PublisherDeps,
): Promise<Map<string, OpenBDEntry>> {
  if (isbns.length === 0) return new Map();

  const url = `${OPENBD_API_URL}?isbn=${isbns.join(",")}`;
  const text = await fetchText(url, deps);
  const data: (OpenBDEntry | null)[] = JSON.parse(text);

  const result = new Map<string, OpenBDEntry>();
  for (let i = 0; i < isbns.length; i++) {
    const entry = data[i];
    if (entry !== null && entry !== undefined) {
      result.set(isbns[i], entry);
    }
  }
  return result;
}

/**
 * openBD エントリを BookRecord に変換する。
 * 出版社サイトから取得できない場合のフォールバック用。
 * url には hanmoto.storelink を使用し、なければ openBD API URL を使用する。
 */
export function openBDEntryToBookRecord(entry: OpenBDEntry): BookRecord {
  const { summary } = entry;
  const storelink = entry.hanmoto?.storelink;
  const contributors = parseContributors(entry);
  // ISBD 区切り（" = 並列タイトル" / " : 副題"）を構造化し、生改行・連続空白を畳む
  const { title, subtitle, alternativeTitle } = parseBibliographicTitle(summary.title);

  return {
    title,
    subtitle,
    alternativeTitle,
    authors: authorsFromEntry(entry),
    contributors: contributors.length > 0 ? contributors : undefined,
    publisher: summary.publisher,
    isbn: summary.isbn,
    publishedAt: parsePubDate(summary.pubdate),
    url: storelink ?? `https://api.openbd.jp/v1/get?isbn=${summary.isbn}`,
    price: getTaxIncludedPrice(entry),
    coverImageUrl: summary.cover || undefined,
    description: findTextByType(entry, "03", "02"),
  };
}

/**
 * openBD の書誌情報で BookRecord の欠損フィールドを補完する。
 * 既存のフィールドは上書きしない。
 */
export function enrichWithOpenBD(book: BookRecord, entry: OpenBDEntry): BookRecord {
  const contributors = parseContributors(entry);
  return {
    ...book,
    // 著者が空のとき openBD から補完する（出版社の検索APIが著者を返さない場合の救済）
    authors: book.authors.length > 0 ? book.authors : authorsFromEntry(entry),
    // 役割つき著者は持っていなければ openBD の ONIX から補完する
    contributors: book.contributors ?? (contributors.length > 0 ? contributors : undefined),
    publishedAt: book.publishedAt ?? parsePubDate(entry.summary.pubdate),
    price: book.price ?? getTaxIncludedPrice(entry),
    coverImageUrl: book.coverImageUrl ?? (entry.summary.cover || undefined),
    description: book.description ?? findTextByType(entry, "03", "02"),
  };
}
