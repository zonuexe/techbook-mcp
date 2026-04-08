# techbook-mcp 設計書

パッケージ名: `@zonuexe/techbook-mcp`

## 概要

日本語技術書の書誌情報を出版社公式サイト・APIから取得するMCPサーバー。
書名・著者名での検索と、URLからの詳細情報取得を提供する。

## アーキテクチャ

ポート＆アダプター（Hexagonal Architecture）を採用し、HTTP・HTML解析・キャッシュの各I/Oを抽象化する。
これによりビジネスロジックをランタイムやネットワーク環境から分離し、ユニットテストを容易にする。

```
┌─────────────────────────────────────────────────────┐
│                   MCP Layer (stdio)                 │
│  search_books / get_book_detail / list_publishers   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Application Layer                      │
│  searchBooks()          getBookDetail()             │
└──────────┬───────────────────────┬──────────────────┘
           │                       │
┌──────────▼──────────┐  ┌─────────▼──────────────────┐
│    Domain Layer     │  │     Publisher Registry      │
│  BookRecord         │  │  PublisherAdapter[]         │
│  SearchQuery        │  │                             │
└─────────────────────┘  └────────────┬───────────────┘
                                      │ uses ports
┌─────────────────────────────────────▼───────────────┐
│                  Ports (interfaces)                 │
│   HttpClient       HtmlParser      CacheStore       │
└──────┬─────────────────┬────────────────┬───────────┘
       │                 │                │
┌──────▼──────┐  ┌───────▼──────┐  ┌─────▼───────────┐
│  Adapters   │  │   Adapters   │  │    Adapters     │
│ FetchHttp   │  │CheerioParser │  │  MemoryCache    │
│ MockHttp    │  │              │  │  NullCache      │
└─────────────┘  └──────────────┘  └─────────────────┘
```

## ディレクトリ構成

```
techbook-mcp/
├── flake.nix              # Nix flake (devShell + package build)
├── flake.lock
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── domain/
│   │   ├── book.ts          # BookRecord, SearchQuery 型定義
│   │   └── publisher.ts     # PublisherAdapter インターフェース
│   ├── ports/
│   │   ├── http.ts          # HttpClient インターフェース
│   │   ├── html-parser.ts   # HtmlParser インターフェース
│   │   └── cache.ts         # CacheStore インターフェース
│   ├── adapters/
│   │   ├── http/
│   │   │   ├── fetch-client.ts  # fetch() ベース実装
│   │   │   └── mock-client.ts   # テスト用モック
│   │   ├── html/
│   │   │   └── cheerio-parser.ts
│   │   ├── cache/
│   │   │   ├── memory-cache.ts
│   │   │   └── null-cache.ts
│   │   └── publishers/
│   │       ├── base.ts          # 共通ユーティリティ (fetchText, parsePrice, ...)
│   │       ├── gihyo.ts         # 技術評論社 (JSON API)
│   │       ├── lambdanote.ts    # ラムダノート (HTML scraping / Shopify)
│   │       └── registry.ts     # 出版社リスト
│   ├── application/
│   │   ├── search-books.ts
│   │   └── get-book-detail.ts
│   ├── mcp/
│   │   ├── server.ts
│   │   └── tools.ts
│   └── main.ts
└── tests/
    ├── unit/
    │   └── adapters/publishers/
    │       ├── gihyo.test.ts
    │       └── lambdanote.test.ts
    └── fixtures/
        ├── gihyo-search.json       # API レスポンスのスナップショット
        └── lambdanote-search.html  # 検索結果ページのスナップショット
```

## 対応出版社

| ID | 名称 | 取得方式 |
|----|------|---------|
| `gihyo` | 技術評論社 | JSON API (`/api_gh/site/search`) |
| `lambdanote` | ラムダノート | HTML スクレイピング (Shopify) |
| `tatsu-zine` | 達人出版会 | HTML スクレイピング (`/books/?search=`) |

### 技術評論社 (gihyo)

JSON APIを使用するためHTMLパースは不要。

```
GET https://gihyo.jp/api_gh/site/search?search={keyword}&limit={n}
```

レスポンス形式:
```json
{
  "total": 9,
  "next": false,
  "query": "TypeScript",
  "list": {
    "978-4-297-XXXXX-X": {
      "title": "書名",
      "subtitle": "サブタイトル",
      "author": { "著": { "著者名": "<ruby>markup</ruby>" } },
      "price": [2200, 0],
      "release": ["2025.9.29", ""],
      "url": "/book/2025/978-4-297-XXXXX-X",
      "cover": ["/assets/images/.../thumb/TH800_....jpg", 160, 200, "/assets/images/.../....jpg"]
    }
  }
}
```

### ラムダノート (lambdanote)

Shopify ストア。HTMLをスクレイピングして書誌情報を取得する。

- 検索: `https://www.lambdanote.com/search?q={keyword}&type=product`
- 詳細: 各商品ページ (`/products/{handle}`)
  - `<script type="application/json">` に埋め込まれた JSON からISBN・著者情報を取得

### 達人出版会 (tatsu-zine)

複数出版社の電子書籍を受託販売するマーケットプレイス。基本的にすべてDRM-free PDF。

- 検索: `https://tatsu-zine.com/books/?search={keyword}`
  - 書籍アイテム構造: `<h3><a href="/books/{slug}">Title</a></h3>` + `<p>Author(著)...</p>`
- 詳細: 各書籍ページ (`/books/{slug}`)
  - 出版社: `<a href="/books/pub/{slug}">` で実際の出版社を取得
  - ソーシャルDRM書籍はページ内に「ソーシャルDRM」の記述あり → `drm: "social"`

## 電子書籍ストア分類

`EbookStore.drm` の値:

| 値 | 意味 |
|----|------|
| `"free"` | 技術的DRMなし (DRM-free PDF/EPUB) |
| `"social"` | ソーシャルDRM (購入者情報の透かし入りPDF、技術的制限なし。広義のDRM-freeとして扱う) |
| `"drm"` | 技術的DRM付き (専用ビューアー必須) |

| ストア | drm |
|--------|-----|
| Gihyo Digital Publishing | `"free"` |
| ラムダノート | `"free"` |
| 達人出版会 | `"free"` (ソーシャルDRM書籍は `"social"`) |
| インプレスブックス (`book.impress.co.jp`) | `"social"` |
| Kindle / 楽天Kobo / BookLive / honto / BOOK☆WALKER / eBookJapan / LINEマンガ | `"drm"` |

## MCPツール

| ツール名 | 説明 | 主な引数 |
|---------|------|---------|
| `search_books` | 書名・著者名で検索 | `title?`, `author?`, `publisher?`, `limit?` |
| `get_book_detail` | URLから詳細情報取得 | `url` |
| `list_publishers` | 対応出版社一覧 | なし |

## ランタイム対応

| ランタイム | 起動方法 |
|----------|---------|
| Node.js 22+ | `node dist/main.js` |
| Bun | `bun src/main.ts` |
| Deno | `deno run --allow-net src/main.ts` |

グローバル `fetch` APIを使用しており、Node.js 18以降・Bun・Denoで動作する。

## 開発環境 (Nix)

```bash
nix develop        # devShell に入る (Node.js 22, Bun, Deno が利用可能)
npm install        # 初回のみ: node_modules と package-lock.json を生成
npm test           # テスト実行
npm run build      # TypeScript コンパイル (→ dist/)
```

`nix build` でパッケージをビルドする場合、初回は `npmDepsHash` の更新が必要:
```bash
nix build 2>&1 | grep "got:"
# → flake.nix の npmDepsHash を更新してから再実行
```

## テスト戦略

- `MockHttpClient` にフィクスチャデータを登録してネットワーク不要のユニットテストを実現
- `NullCacheStore` でキャッシュをバイパス
- `tests/fixtures/` に各サイトのレスポンススナップショットを配置
- gihyo: JSON APIなので `gihyo-search.json` を MockHttpClient に渡す
- lambdanote: HTML scraping なので `lambdanote-search.html` + `CheerioHtmlParser` で検証
