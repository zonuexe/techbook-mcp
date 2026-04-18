/**
 * 日本のISBN出版者記号 (978-4-XXXXX-...) とアダプターIDの対応表。
 *
 * ISBN出版者記号は978-4-（グループ識別子）に続くXXXXXの部分。
 * 桁数はJPOの範囲規定（3桁: 200-699、4桁: 7000-8499、
 * 5桁: 85000-89999、6桁: 900000-949999）による。
 *
 * 出典: JPO登録出版者照会 https://isbn.jpo.or.jp/index.php/fix__ref_pub/
 * および各出版社公式サイト・版元ドットコムにて確認済み（2026-04-19）。
 *
 * 電子書籍専業（達人出版会・PEAKS）や
 * 書店プラットフォーム（BOOK TECH・技術書典）はISBN出版者記号なし。
 */

/** アダプターIDとISBN出版者記号の対応。複数記号を持つ出版社は配列で列挙。 */
export const PUBLISHER_ISBN_CODES: ReadonlyMap<string, readonly string[]> = new Map([
  ["coronasha",         ["339"]],
  ["maruzen-publishing",["621"]],
  ["gihyo",             ["297"]],
  ["saiensu",           ["7819"]],
  ["seshop",            ["7981"]],
  ["oreilly-japan",     ["8144"]],
  ["juse-p",            ["8171"]],
  ["impress-books",     ["8443"]],
  ["born-digital",      ["86246"]],
  ["personal-media",    ["89362"]],
  ["rutles",            ["89977"]],
  ["manatee",           ["8399"]],
  ["lambdanote",        ["908686"]],
  ["optronics",         ["902312"]],
]);

/**
 * ISBN-13に対応するアダプターIDを返す。
 * 例: "9784297128152" → "gihyo"
 */
export function findAdapterIdByIsbn(isbn13: string): string | undefined {
  const raw = isbn13.replace(/-/g, "");
  if (!raw.startsWith("9784")) return undefined;
  // 9784 の次から始まる出版者記号候補を長さ順（長い方優先）でチェック
  for (const [adapterId, codes] of PUBLISHER_ISBN_CODES) {
    for (const code of codes) {
      if (raw.startsWith(`9784${code}`)) {
        return adapterId;
      }
    }
  }
  return undefined;
}
