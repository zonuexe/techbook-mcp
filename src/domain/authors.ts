import { normalizeForMatch } from "./text-match.js";

/**
 * 著者配列から重複を除く（出現順を保持）。
 * 比較キーは normalizeForMatch なので "吉川 邦夫" と "吉川邦夫" のような表記ゆれも同一視する。
 * 表示は最初に現れた表記を採用する。空文字は除去する。
 */
export function dedupeAuthors(authors: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const author of authors) {
    const name = author.trim();
    if (!name) continue;
    const key = normalizeForMatch(name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
