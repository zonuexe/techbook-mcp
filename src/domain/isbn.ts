/** ハイフン・空白・"ISBN" 接頭辞を除去して数字列（ISBN-10 は末尾 X 可）に正規化する */
export function normalizeIsbn(text: string): string {
  return text
    .replace(/isbn/i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

/**
 * 文字列が ISBN-10 / ISBN-13 として妥当な形か判定する（桁数・接頭辞のみ。チェックディジットは検証しない）。
 * search_books の title に ISBN が入力されたケースを ISBN 経路へ振り分けるために使う。
 */
export function looksLikeIsbn(text: string): boolean {
  const s = normalizeIsbn(text);
  return /^(?:97[89]\d{10}|\d{9}[\dX])$/.test(s);
}
