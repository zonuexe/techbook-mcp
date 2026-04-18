# techbook-mcp

[![CI](https://github.com/zonuexe/techbook-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/zonuexe/techbook-mcp/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/@zonuexe/techbook-mcp)](https://www.npmjs.com/package/@zonuexe/techbook-mcp)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

日本語技術書の書誌情報を出版社公式サイト・APIから取得する [MCP](https://modelcontextprotocol.io/) サーバー。

Claude などの AI アシスタントから、複数の出版社を横断して技術書を検索したり、書籍の詳細情報（著者・価格・ISBN・電子書籍ストアなど）を取得できます。

## 使用例

### 技術書を検索する

> 「Rustの入門書を探して」

Claude が `search_books` ツールを呼び出し、対応する全出版社から「Rust」を含む書籍を一覧で返します。

```json
{
  "books": [
    {
      "title": "実践Rustプログラミング入門",
      "authors": ["山口聖弘", "吉川哲史", "扇谷陽", "尾崎嶺", "豊田優貴", "中村謙弘", "フレイム"],
      "publisher": "秀和システム",
      "publishedAt": "2020-08-22",
      "isbn": "9784798061702",
      "url": "https://www.seshop.com/product/detail/22342",
      "price": 3740,
      "ebookStores": [
        {
          "name": "SEshop",
          "url": "https://www.seshop.com/product/detail/22342",
          "drm": "social",
          "drmLabel": "DRMフリー (ソーシャル)"
        }
      ]
    }
  ]
}
```

### 特定の出版社だけを検索する

> 「技術評論社のDocker本を調べて」

```json
// search_books({ title: "Docker", publisher: "gihyo" })
```

### 書籍の詳細情報を取得する

> 「この URL の本の詳細を教えて: https://gihyo.jp/book/2024/978-4-297-14000-6」

Claude が `get_book_detail` ツールで著者・価格・ISBN・購入可能なストア情報をまとめて取得します。

### 対応出版社を確認する

> 「どの出版社に対応していますか？」

Claude が `list_publishers` ツールを呼び出し、出版社名と ID の一覧を返します。

## 対応ソース

### 出版社・書店

`publisher` パラメータに ID を指定すると、その出版社のみを検索できます。

| 出版社・書店 | ID | ISBN出版者記号 | 取得方式 |
|---|---|---|---|
| BOOK TECH | `book-tech` | — | HTML scraping |
| ボーンデジタル | `born-digital` | `86246` | HTML scraping (EUC-JP) |
| コロナ社 | `coronasha` | `339` | HTML scraping |
| 技術評論社 | `gihyo` | `297` | JSON API |
| インプレスブックス | `impress-books` | `8443` | HTML scraping |
| 日科技連出版社 | `juse-p` | `8171` | HTML scraping |
| ラムダノート | `lambdanote` | `908686` | HTML scraping (Shopify) |
| マナティ（マイナビ出版直販） | `manatee` | `8399` | HTML scraping |
| 丸善出版 | `maruzen-publishing` | `621` | HTML scraping |
| オプトロニクス社 | `optronics` | `902312` | HTML scraping |
| オライリー・ジャパン | `oreilly-japan` | `8144` | HTML scraping (ローカルフィルタ) |
| PEAKS | `peaks` | — | HTML scraping (ローカルフィルタ) |
| パーソナルメディア | `personal-media` | `89362` | HTML scraping (ローカルフィルタ) |
| ラトルズ | `rutles` | `89977` | HTML scraping (EUC-JP) |
| サイエンス社 | `saiensu` | `7819` | HTML scraping |
| SEshop（翔泳社） | `seshop` | `7981` | HTML scraping |
| 達人出版会 | `tatsu-zine` | — | HTML scraping |
| 技術書典オンラインマーケット | `techbookfest` | — | GraphQL API |

ISBN出版者記号（`978-4-XXXXX-...` の `XXXXX` 部分）が登録されている出版社は、ISBNだけで直接検索できます。
「—」は電子書籍専業・同人誌マーケット等でISBN出版者記号を持たないソースです。

### 外部 API

| サービス | ID | 備考 |
|---|---|---|
| Google Books | `google-books` | APIキー必須（`techbook-mcp setup` で設定） |

## MCPツール

### `search_books`

書名・著者名で複数の出版社を横断検索します。

| パラメータ | 型 | 説明 |
|------------|-----|------|
| `title` | string | 書名（部分一致） |
| `author` | string | 著者名（部分一致） |
| `publisher` | string | 出版社ID（省略時は全社検索） |
| `limit` | number | 1出版社あたりの最大件数（デフォルト: 10、最大: 50） |

### `get_book_detail`

書籍の公式ページ URL から詳細な書誌情報を取得します。

| パラメータ | 型 | 説明 |
|------------|-----|------|
| `url` | string | 書籍の公式ページ URL |

### `list_publishers`

対応出版社の一覧と ID を返します。

## セットアップ

### Claude Desktop

`claude_desktop_config.json` に以下を追加してください。

```json
{
  "mcpServers": {
    "techbook-mcp": {
      "command": "npx",
      "args": ["-y", "@zonuexe/techbook-mcp"]
    }
  }
}
```

設定ファイルの場所:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Claude Code

```bash
claude mcp add techbook-mcp -- npx -y @zonuexe/techbook-mcp
```

## 開発

```bash
npm install
npm test        # ユニットテスト実行（Vitest）
npm run build   # TypeScript コンパイル → dist/
```

### ランタイム

| ランタイム | 起動方法 |
|----------|---------|
| Node.js 22+ | `node dist/main.js` |
| Bun | `bun src/main.ts` |
| Deno | `deno run --allow-net src/main.ts` |

## ライセンス

AGPL-3.0-or-later
