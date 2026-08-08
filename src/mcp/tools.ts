import type { Tool } from "@modelcontextprotocol/server";

export const TOOLS: Tool[] = [
  {
    name: "search_books",
    description:
      "書名・著者名から日本語技術書を検索し、書誌情報の一覧を返します。" +
      "複数の出版社を横断して検索します。" +
      "各書籍の publishedAt は YYYY-MM-DD 形式（riida の release_date に対応）、" +
      "language は ISO 639-1（省略時は \"ja\"）です。" +
      "結果はクエリとの一致度 matchScore（0〜1、1が完全一致）の降順で並んでおり、" +
      "先頭ほど本命候補です。一致する書籍がなければ空配列を返します" +
      "（無関係な新着本でフォールバックしません）。" +
      "検索語は ASCII 語・正確なフルタイトルが最も当たりやすく、" +
      "日本語の部分語は空白区切りの複数トークンにすると拾われやすくなります。" +
      "版違いを厳密に当てたい場合は title に ISBN を渡すと ISBN 検索に切り替わります。",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "書名（部分一致）",
        },
        author: {
          type: "string",
          description: "著者名（部分一致）",
        },
        publisher: {
          type: "string",
          description:
            "出版社IDで検索対象を絞り込みます。指定しない場合は全出版社を検索します。" +
            "利用可能なIDは list_publishers で確認できます。",
        },
        limit: {
          type: "number",
          description: "1出版社あたりの最大取得件数（デフォルト: 10、最大: 50）",
          default: 10,
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_book_detail",
    description: "書籍の公式ページURLから詳細な書誌情報を取得します。",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "書籍の公式ページURL（出版社サイトのURL）",
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "list_publishers",
    description: "対応している出版社の一覧とIDを返します。",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_book_by_isbn",
    description:
      "ISBNから書誌情報を取得します。" +
      "openBDで出版社を特定し、可能であれば出版社サイトから詳細情報を取得します。" +
      "出版社サイトから取得できない場合はopenBDのデータを返します。",
    inputSchema: {
      type: "object",
      required: ["isbn"],
      properties: {
        isbn: {
          type: "string",
          description: "ISBN-13（ハイフンあり・なし両対応、例: 978-4-908686-20-7）",
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "resolve_book",
    description:
      "手元の手がかり（ISBN・書名・著者）から正規の1冊を確信度つきで同定します。" +
      "PDF の奥付から抽出した曖昧なメタデータを書誌レコードに解決する用途に最適です。" +
      "isbn があれば openBD→出版社サイト→カーリルの順で解決し、title も渡すと解決結果と照合して" +
      "版違い・誤ISBN を検出します。isbn が無い／解決できない場合は横断検索の一致度でベストマッチを採ります。" +
      "返り値: status（matched/ambiguous/not_found）・confidence（high/medium/low）・book・" +
      "matchScore・source・validation・候補（ambiguous時）・reason。confidence=high はそのまま採用、" +
      "low/ambiguous は要確認の目安です。" +
      "validation は book がある限り source 非依存で付与し、評価不能な項目は null で明示します： " +
      "isbnMatches=false は『要求ISBNは見つからず書名一致で代替候補を返している』警告（このとき confidence は high になりません）。" +
      "editionDiffers は ISBN 一致時は常に false（版が確定するため）。" +
      "book.title は副題・並列タイトルを除いた本タイトルで、副題は book.subtitle・別言語タイトルは book.alternativeTitle に分離されます。" +
      "isbn / title / author のいずれかは必須。",
    inputSchema: {
      type: "object",
      properties: {
        isbn: { type: "string", description: "ISBN（ハイフン有無どちらでも可）" },
        title: { type: "string", description: "書名（ISBN との照合・検索に使用）" },
        author: { type: "string", description: "著者名" },
        publisher: { type: "string", description: "出版社ID（検索経路の絞り込みヒント。任意）" },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "resolve_books",
    description:
      "複数の手がかりを一括で同定します（resolve_book のバッチ版）。" +
      "ローカル蔵書への一括メタデータ付与に最適で、入力順に揃った結果配列を返します。" +
      "各要素は resolve_book と同じ形（status/confidence/book/matchScore/source）です。" +
      "ISBN 主体の入力は openBD 中心で軽量ですが、書名のみの項目は横断検索を伴うため項目数に注意してください。",
    inputSchema: {
      type: "object",
      required: ["books"],
      properties: {
        books: {
          type: "array",
          description: "同定したい手がかりの配列。各要素に isbn / title / author / publisher のいずれかを指定",
          items: {
            type: "object",
            properties: {
              isbn: { type: "string" },
              title: { type: "string" },
              author: { type: "string" },
              publisher: { type: "string" },
            },
          },
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];
