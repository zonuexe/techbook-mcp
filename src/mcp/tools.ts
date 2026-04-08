export const TOOLS = [
  {
    name: "search_books",
    description:
      "書名・著者名から日本語技術書を検索し、書誌情報の一覧を返します。" +
      "複数の出版社を横断して検索します。",
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
] as const;
