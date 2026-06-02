import type { BookRecord, SearchQuery } from "./book.js";

/**
 * 照合用にテキストを正規化する。
 *
 * - NFKC で全角・半角を統一（"Ｒｕｓｔ" → "Rust"、"（" → "("）
 * - 小文字化
 * - 装飾・区切り記号（【】〔〕（）()［］、・ー― ～: 空白など）を除去
 *
 * PDF奥付から抜いた表記ゆれのある title/author を、出版社サイトの
 * 表記とできるだけ一致させるための前処理。
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    // 装飾括弧・区切り・長音/ダッシュ・約物・空白をまとめて除去
    .replace(/[\s【】〔〕「」『』《》\[\](){}（）｛｝<>＜＞、。，．・,.:;：；!！?？~〜～\-－—―ー_/\\|=+*'"`]/g, "");
}

/** 1 を最良とする 0..1 の包含スコア。短い側が長い側に完全包含されるほど高い */
function containmentScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.includes(shorter)) {
    // 完全一致(1)に対し、長さ比で部分一致を割り引く（短すぎる偶然一致を抑制）
    return 0.5 + 0.5 * (shorter.length / longer.length);
  }
  return 0;
}

/** クエリ書名と候補書名の一致度（0..1） */
export function titleMatchScore(query: string, candidate: string): number {
  return containmentScore(normalizeForMatch(query), normalizeForMatch(candidate));
}

/** クエリ著者名と候補著者リストの一致度（0..1）。最も一致する1名を採用 */
export function authorMatchScore(query: string, candidates: readonly string[]): number {
  const q = normalizeForMatch(query);
  if (!q) return 0;
  let best = 0;
  for (const c of candidates) {
    best = Math.max(best, containmentScore(q, normalizeForMatch(c)));
    if (best === 1) break;
  }
  return best;
}

/**
 * クエリと書籍レコードの総合一致度（0..1）。
 *
 * - title・author 両方が指定された場合は平均
 * - 片方のみ指定ならそのスコア
 * - どちらも未指定なら 0（スコア付けの意味がない）
 */
export function matchScore(query: SearchQuery, book: BookRecord): number {
  const scores: number[] = [];
  if (query.title) scores.push(titleMatchScore(query.title, book.title));
  if (query.author) scores.push(authorMatchScore(query.author, book.authors));
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
