/**
 * 連続する空白（改行・タブを含む）を単一スペースに畳み、前後の空白を除去する。
 * スクレイピング由来の生改行（"図解即戦力\nWeb技術…"）が出力に漏れるのを防ぐ。
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface ParsedTitle {
  title: string;
  subtitle?: string;
  alternativeTitle?: string;
}

/**
 * 図書館・JPRO/ONIX 由来の書名表記（ISBD 区切り）を構造化する。
 *
 * openBD の `summary.title` は "本タイトル = 並列タイトル : 副題" の形を取ることがある。
 * ISBD の出現順に従い、先に " : "（副題）、続いて " = "（並列タイトル）を分離する。
 * 区切りはいずれも前後にスペースを伴うもののみを対象とし、"OAuth 2.0" のような
 * 書名内のコロン・等号は誤分割しない。区切りが無ければ `title` のみを返す。空白は畳む。
 */
export function parseBibliographicTitle(raw: string): ParsedTitle {
  let main = collapseWhitespace(raw);

  let subtitle: string | undefined;
  const colonIdx = main.indexOf(" : ");
  if (colonIdx >= 0) {
    subtitle = main.slice(colonIdx + 3).trim() || undefined;
    main = main.slice(0, colonIdx).trim();
  }

  let alternativeTitle: string | undefined;
  const eqIdx = main.indexOf(" = ");
  if (eqIdx >= 0) {
    alternativeTitle = main.slice(eqIdx + 3).trim() || undefined;
    main = main.slice(0, eqIdx).trim();
  }

  return {
    title: main,
    ...(subtitle ? { subtitle } : {}),
    ...(alternativeTitle ? { alternativeTitle } : {}),
  };
}
