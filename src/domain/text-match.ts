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
    .replace(/[\s【】〔〕「」『』《》[\](){}（）｛｝<>＜＞、。，．・,.:;：；!！?？~〜～\-－—―ー_/\\|=+*'"`]/g, "");
}

/**
 * 正規化済み文字列から版表記マーカーを除去する。
 * "独習php第4版" → "独習php"、"初めての人のためのlisp増補改訂版" → "初めての人のためのlisp"。
 * 同一作品の版違いを同一視するための前処理（normalizeForMatch の後に適用する）。
 */
const EDITION_MARKER_RE =
  /第[0-9一二三四五六七八九十百]+[版刷]|増補改訂版|改訂新版|改訂版|増補版|新装版|普及版|新版/g;

export function stripEditionMarkers(normalized: string): string {
  return normalized.replace(EDITION_MARKER_RE, "");
}

/** 書名に版表記マーカー（第N版・増補改訂版 等）が含まれるか */
export function hasEditionMarker(text: string): boolean {
  const normalized = normalizeForMatch(text);
  return stripEditionMarkers(normalized) !== normalized;
}

/**
 * 2つの書名が「同一作品」である度合い（0..1）。版表記を畳んで照合する。
 *
 * 版違い（"独習PHP 第4版" vs "独習PHP"）は 1 に近く、別作品（誤ISBN等）は 0 になる。
 * `isbnTitleAgree` を「同一作品なら版違いでも true」に一般化するための信号。
 */
export function sameWorkScore(a: string, b: string): number {
  const na = stripEditionMarkers(normalizeForMatch(a));
  const nb = stripEditionMarkers(normalizeForMatch(b));
  return containmentScore(na, nb);
}

/** 2つの書名が正規化後に完全一致するか（版表記も含めて同一） */
export function titlesExactMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  return na !== "" && na === normalizeForMatch(b);
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

/**
 * クエリ書名と候補書名の一致度（0..1）。
 *
 * 正規化後に完全一致すれば 1。そうでなければクエリを空白でトークン分割し、
 * 候補書名に含まれるトークンの割合でスコアを付ける（完全一致を上回らないよう 0.9 で頭打ち）。
 * トークン方式により純日本語の部分文字列（"メール技術 教科書" → "メール技術の教科書"）も拾える。
 * どのトークンも含まれなければ 0 ＝ 無関係（フォールバック書籍の除外に使う）。
 */
export function titleMatchScore(query: string, candidate: string): number {
  const cand = normalizeForMatch(candidate);
  const q = normalizeForMatch(query);
  if (!q || !cand) return 0;
  if (q === cand) return 1;

  const tokens = query.split(/\s+/).map(normalizeForMatch).filter(Boolean);
  if (tokens.length === 0) return 0;
  const matched = tokens.filter(t => cand.includes(t)).length;
  if (matched === 0) return 0;
  return Math.min(0.9, 0.9 * (matched / tokens.length));
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
