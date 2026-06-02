export const TOOLS = [
  {
    name: "search_books",
    description:
      "書名・著者名から日本語技術書を検索し、書誌情報の一覧を返します。" +
      "複数の出版社を横断して検索します。" +
      "各書籍の publishedAt は YYYY-MM-DD 形式（riida の release_date に対応）、" +
      "language は ISO 639-1（省略時は \"ja\"）です。" +
      "結果はクエリとの一致度 matchScore（0〜1、1が完全一致）の降順で並んでおり、" +
      "先頭ほど本命候補です。",
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
  },
  {
    name: "list_publishers",
    description: "対応している出版社の一覧とIDを返します。",
    inputSchema: {
      type: "object",
      properties: {},
    },
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
  },
] as const;
