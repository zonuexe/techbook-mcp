# techbook-mcp 設計書

パッケージ名: `@zonuexe/techbook-mcp`
ライセンス: AGPL-3.0-only

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
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── docs/
│   └── design-doc.md      # 本ドキュメント
├── src/
│   ├── domain/
│   │   ├── book.ts          # BookRecord, SearchQuery, DrmType 型定義
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
│   │       ├── base.ts          # 共通ユーティリティ (fetchText, parsePrice, EBOOK_STORE_PATTERNS)
│   │       ├── book-tech.ts     # BOOK TECH
│   │       ├── born-digital.ts  # ボーンデジタル
│   │       ├── coronasha.ts     # コロナ社
│   │       ├── gihyo.ts         # 技術評論社
│   │       ├── lambdanote.ts    # ラムダノート
│   │       ├── manatee.ts       # マナティ (マイナビ出版直販)
│   │       ├── maruzen-publishing.ts  # 丸善出版
│   │       ├── optronics.ts     # オプトロニクス社
│   │       ├── oreilly-japan.ts # オライリー・ジャパン
│   │       ├── peaks.ts         # PEAKS
│   │       ├── personal-media.ts  # パーソナルメディア
│   │       ├── rutles.ts        # ラトルズ
│   │       ├── saiensu.ts       # サイエンス社
│   │       ├── seshop.ts        # SEshop (翔泳社)
│   │       ├── tatsu-zine.ts    # 達人出版会
│   │       ├── techbookfest.ts  # 技術書典
│   │       └── registry.ts      # 出版社リスト (DEFAULT_PUBLISHERS)
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
    │       └── *.test.ts        # 各アダプターのユニットテスト
    └── fixtures/
        └── *                    # HTTPレスポンスのスナップショット
```

## 対応出版社

| ID | 名称 | 取得方式 | 備考 |
|----|------|---------|------|
| `book-tech` | BOOK TECH | HTML scraping | カラーミーショップ |
| `born-digital` | ボーンデジタル | HTML scraping | カラーミーショップ・EUC-JP エンコード必須 |
| `coronasha` | コロナ社 | HTML scraping | 電子版フラグで絞り込み・外部ストアへ委託販売 |
| `gihyo` | 技術評論社 | JSON API | `/api_gh/site/search` |
| `lambdanote` | ラムダノート | HTML scraping | Shopify ストア |
| `manatee` | マナティ (マイナビ出版直販) | HTML scraping | 複数出版社を委託販売 |
| `maruzen-publishing` | 丸善出版 | HTML scraping | Referer ヘッダー必須 |
| `optronics` | オプトロニクス社 | HTML scraping | EC-CUBE ベース |
| `oreilly-japan` | オライリー・ジャパン | HTML scraping | 検索APIなし・ローカルフィルタ |
| `peaks` | PEAKS | HTML scraping | 検索APIなし・ローカルフィルタ |
| `personal-media` | パーソナルメディア | HTML scraping | 検索APIなし・ローカルフィルタ |
| `rutles` | ラトルズ | HTML scraping | クエリを EUC-JP エンコード必須 |
| `saiensu` | サイエンス社 | HTML scraping | 電子書籍のみ (`mediaName === "電子"`) |
| `seshop` | SEshop (翔泳社) | HTML scraping | `category_id=327` で電子書籍に絞り込み |
| `tatsu-zine` | 達人出版会 | HTML scraping | 複数出版社を委託販売 |
| `techbookfest` | 技術書典オンラインマーケット | GraphQL POST API | XSRF-TOKEN 必須 |

### 各アダプターの実装メモ

**BOOK TECH (book-tech)** — カラーミーショップ
```
GET https://book-tech.com/books?q%5Btitle_or_overview_or_identification_number_1_or_product_code_cont%5D={keyword}
```
- `div.contents-index-item` が書籍アイテム
- 著者: `a[href*='author_relations']` テキストから役割語（`（著）` 等）を除去
- ISBN: `.contents-book-about-id` の13桁数字列
- 価格: `.price` テキストから税込価格を取得
- DRM: `"social"`

**ボーンデジタル (born-digital)** — カラーミーショップ
```
GET https://wgn-obs.shop-pro.jp/?mode=srh&keyword={EUC-JP encoded keyword}
```
- クエリを **EUC-JP** でパーセントエンコード（`iconv-lite` 使用）
- 電子書籍の絞り込み: タイトルが `【` で始まるもの（`【PDFダウンロード版】`・`【電子書籍版】`）
- アイテム: `li.c-product-list__item`
- 価格: `var Colorme = {...}` JSON の `product.sales_price_including_tax`
- 著者・発行日: 詳細ページの説明テキストをタブまたは全角コロン `：` で分割して解析
- DRM: `"social"`（PDFにメールアドレスが印字）

**コロナ社 (coronasha)**
```
GET https://www.coronasha.co.jp/np/result.html?q={keyword}
```
- 電子版フラグ: `ul.status-list li` に `"電子版あり"` があるものだけ対象
- タイトル: `.tunogaki` と `.book-title` を結合（例: `"1から始める"` + `"Juliaプログラミング大全"`）
- 書誌情報: `.book-info dl` の dt/dd から定価・ISBN・発行年月日を取得
- 価格は詳細ページのサイドバー `.price` から取得（`.book-info dl` には含まれない）
- 電子書籍ストアは `extractEbookStoresFromDoc()` で自動検出（Kindle, Kinoppy, VarsityWave eBooks 等）
- Knowledge Worker (`kw.maruzen.co.jp`) はパターン未登録のため自動除外

**技術評論社 (gihyo)** — JSON API
```
GET https://gihyo.jp/api_gh/site/search?search={keyword}&limit={n}
```
レスポンス: `list[isbn]` オブジェクト。`author` は `{ 役割: { 名前: "<ruby>markup</ruby>" } }` 形式なのでHTML除去が必要。

**ラムダノート (lambdanote)** — Shopify
```
GET https://www.lambdanote.com/search?q={keyword}&type=product
```
詳細ページの `<script type="application/json">` 埋め込みJSONからISBN・著者情報を取得。

**マナティ (manatee)** — マイナビ出版直販
```
GET https://book.mynavi.jp/manatee/list/?topics_keyword={keyword}
```
ソーシャルDRM（公式 about ページに明記）。

**丸善出版 (maruzen-publishing)**
```
GET https://www.maruzen-publishing.co.jp/search/?search_keyword={keyword}&format=1
```
- **Referer ヘッダー必須**（なければ 403）
- 価格・ISBNはJS動的ロードのため取得不可
- `kw.maruzen.co.jp`（Knowledge Worker / Maruzen eBook Library）は機関向けなので除外

**オプトロニクス社 (optronics)** — EC-CUBE ベース
```
GET https://optronics-ebook.com/products/list.php?name={keyword}&category_id=1
```
`listcomment` / `main_comment` の自由テキストから `著者:` / `発行:` 行を正規表現で解析。

**オライリー・ジャパン (oreilly-japan)** — ローカルフィルタ
```
GET https://www.oreilly.co.jp/ebook/
```
検索APIなし。全一覧ページをタイトルキーワードでローカルフィルタリング。著者のみ検索は非対応。

**PEAKS (peaks)** — ローカルフィルタ
```
GET https://peaks.cc/
```
検索APIなし。トップページに全書籍（27冊程度）が掲載されており、ローカルフィルタリング。

**ラトルズ (rutles)** — EUC-JP ショッピングカート
```
GET https://shop.rutles.net/?mode=srh&keyword={EUC-JP encoded keyword}
```
- クエリを **EUC-JP** でパーセントエンコード（UTF-8では検索ヒットなし）
- `iconv-lite` を使用してエンコード
- 電子書籍は `【電子版】` がタイトルに含まれる
- 詳細ページの `var Colorme = {...}` JSON から ISBN・価格を取得

**サイエンス社 (saiensu)**
```
GET https://www.saiensu.co.jp/search/?keyword={keyword}
```
電子書籍のみ: `article.bookListItem` の `.bookListItemData_mediaName` が `"電子"` のもの。
DRM: `"password_pdf"`（パスワード付きPDF）

**SEshop / 翔泳社 (seshop)**
```
GET https://www.seshop.com/search?keyword={keyword}&category_id=327&sort=newer
```
- `category_id=327` が電子書籍（PDF版）カテゴリ
- さらに `div.product-data[data-category]` が `"電子書籍"` 始まりのものだけ返す
- 詳細ページの `cxenseparse:sho-*` メタタグから ISBN・価格・発売日を取得
- PDFにメールアドレスと著作権情報が埋め込まれる → `"social"` DRM

**パーソナルメディア (personal-media)** — ローカルフィルタ
```
GET https://www.personal-media.co.jp/webshop/book/
```
- 検索APIなし。PDF直販書籍の全一覧テーブルをタイトルキーワードでローカルフィルタリング
- 著者のみ検索は非対応（`!query.title` のとき `[]` を返す）
- 詳細ページにセマンティックHTMLなし。`body` 全テキストを行分割して正規表現でメタデータを抽出
  - 著者行: `^(.+?)\s+(?:著|監修|編|訳|...)$` パターンで役割語を検出・除去
  - ISBN: `"ISBN"` を含む行から `\d[\d-]{12,}` で抽出
  - 発行日: `"発売"` を含む行から `(\d{4})年(\d{1,2})月` を抽出 → `"YYYY-MM-01"` 形式
- 電子書籍ストアは相対URLのため `extractEbookStoresFromDoc()` は不使用。パス文字列で手動検出
  - `/webshop/book/` を含むリンク → パーソナルメディア (PDF版, `"social"`)
  - `/smoothreader/store/` を含むリンク → Smooth Reader (専用ビューアー, `"drm"`)

**達人出版会 (tatsu-zine)**
```
GET https://tatsu-zine.com/books/?search={keyword}
```
複数出版社の電子書籍を委託販売。全書籍ソーシャルDRM。

**技術書典 (techbookfest)** — GraphQL
```
POST https://techbookfest.org/api/graphql
```
- **XSRF-TOKEN 必須**: GETホームページ → Set-Cookie から取得 → Cookie と `X-XSRF-TOKEN` ヘッダー両方に付与
- インラインフラグメント必須: `node { ... on ProductInfoSearchResult { product { ... } } }`

## DrmType

```typescript
type DrmType = "free" | "social" | "password_pdf" | "drm";
```

| 値 | 意味 |
|----|------|
| `"free"` | 技術的DRMなし (DRM-free PDF/EPUB) |
| `"social"` | ソーシャルDRM (購入者情報の透かし入りPDF、技術的制限なし) |
| `"password_pdf"` | パスワード付きPDF (標準PDFビューアで閲覧可、制限あり) |
| `"drm"` | 技術的DRM付き (専用ビューアー必須) |

## 電子書籍ストア分類 (EBOOK_STORE_PATTERNS)

`src/adapters/publishers/base.ts` の `EBOOK_STORE_PATTERNS` で URL パターンから DRM 種別を自動判定する。

| ストア | drm | 根拠 |
|--------|-----|------|
| 技術書典 | `free` | 公式方針 |
| オライリー・ジャパン | `free` | 公式方針 |
| ラトルズ | `free` | 購入・確認済み |
| PEAKS | `free` | 利用規約に明記 |
| オプトロニクス社 | `free` | 購入・確認済み |
| Gihyo Digital Publishing | `social` | 公式方針 |
| SEshop (翔泳社) | `social` | メールアドレス埋め込み透かし |
| BOOK TECH | `social` | 購入者情報透かし |
| ボーンデジタル | `social` | PDFにメールアドレス印字 |
| マナティ | `social` | 公式 about ページに明記 |
| ラムダノート | `social` | 公式方針 |
| 達人出版会 | `social` | 公式方針 |
| インプレスブックス | `social` | 公式方針 |
| サイエンス社 | `password_pdf` | パスワード付きPDF |
| Kindle | `drm` | — |
| Kinoppy | `drm` | `kinokuniya.co.jp/kinoppystore` および `kinokuniya.co.jp/f/dsg-08` 形式 |
| VarsityWave eBooks | `drm` | 大学生協電子書籍 (coop-ebook.jp) |
| 楽天Kobo | `drm` | — |
| BookLive | `drm` | — |
| honto | `drm` | — |
| BOOK☆WALKER | `drm` | — |
| eBookJapan | `drm` | — |
| LINEマンガ | `drm` | — |

## MCPツール

| ツール名 | 説明 | 主な引数 |
|---------|------|---------|
| `search_books` | 書名・著者名で検索 | `title?`, `author?`, `publisher?`, `limit?` |
| `get_book_detail` | URLから詳細情報取得 | `url` |
| `list_publishers` | 対応出版社一覧 | なし |

## 新しいアダプターの追加手順

1. `src/adapters/publishers/{id}.ts` を作成し `PublisherAdapter` を実装
   - `search()`: 検索APIまたはHTMLスクレイピングで `BookRecord[]` を返す
   - `getDetail()`: 詳細ページをスクレイピングして `BookRecord` を返す
2. `tests/fixtures/{id}-search.html` (または `.json`) を作成
3. `tests/fixtures/{id}-detail.html` を作成
4. `tests/unit/adapters/publishers/{id}.test.ts` を作成
5. 必要なら `base.ts` の `EBOOK_STORE_PATTERNS` にストアパターンを追加
6. `src/adapters/publishers/registry.ts` に登録

よく使う共通ユーティリティ (`base.ts`):
- `fetchText(url, deps, extraHeaders?)` — キャッシュ付きHTTP GET
- `parseJapanesePrice(text)` — "3,740円（税込）" → 3740
- `resolveUrl(base, path)` — 相対URLを絶対URLに解決
- `extractEbookStoresFromDoc(doc)` — ページ内リンクから電子書籍ストアを自動検出

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

## テスト戦略

- `MockHttpClient` にフィクスチャデータを登録してネットワーク不要のユニットテストを実現
- `NullCacheStore` でキャッシュをバイパス
- `CheerioHtmlParser` を実際のパーサーとして使用（モック不要）
- `tests/fixtures/` に各サイトのレスポンススナップショットを配置

### MockHttpClient の使い方

```typescript
const http = new MockHttpClient()
  .addResponse("https://example.com/search", { status: 200, body: searchHtml })
  .addResponse("https://example.com/book/1", { status: 200, body: detailHtml });
// URLプレフィックスで前方一致マッチ
```

### POST エンドポイントのテスト

```typescript
const http = new MockHttpClient()
  .addPostResponse("https://api.example.com/graphql", { status: 200, body: jsonStr });
```
