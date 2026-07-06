# techbook-mcp 設計書

パッケージ名: `@zonuexe/techbook-mcp`
ライセンス: AGPL-3.0-or-later

## 概要

日本語技術書（および一部の海外技術書）の書誌情報を出版社公式サイト・APIから取得するMCPサーバー。
書名・著者名での検索と、URLからの詳細情報取得を提供する。
価格は原則 税込円（整数）だが、海外出版社は当該通貨の数値と `BookRecord.currency`（ISO 4217）で表す。
言語は `BookRecord.language`（ISO 639-1、省略時 `"ja"`）で表す。

書籍管理アプリ [Riida](https://github.com/zonuexe/riida) の `riida-mcp` とシームレスに連携することを目標とし、
利用エージェント側の試行錯誤を減らしてスムーズに書誌を取得できることを重視する。
`publishedAt`（YYYY-MM-DD）は riida の `release_date` に対応する。

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
├── docs/
│   └── design-doc.md      # 本ドキュメント
├── src/
│   ├── domain/
│   │   ├── book.ts          # BookRecord, SearchQuery, DrmType 型定義
│   │   ├── publisher.ts     # PublisherAdapter インターフェース (language, scale)
│   │   ├── text-match.ts    # 照合用テキスト正規化・matchScore 算出
│   │   ├── title.ts         # 書名の空白畳み・ISBD 副題/並列タイトル構造化
│   │   └── isbn.ts          # ISBN 正規化・looksLikeIsbn 判定
│   ├── ports/
│   │   ├── http.ts          # HttpClient インターフェース
│   │   ├── html-parser.ts   # HtmlParser インターフェース
│   │   └── cache.ts         # CacheStore インターフェース
│   ├── adapters/
│   │   ├── http/
│   │   │   ├── fetch-client.ts  # fetch() ベース実装 (charset を見て EUC-JP/Shift_JIS をデコード)
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
│   │       ├── c-r.ts           # C&R研究所 (公式サイト・本の森.JP)
│   │       ├── coronasha.ts     # コロナ社
│   │       ├── cq-publishing.ts # CQ出版社 (Tech Village 書庫＆販売)
│   │       ├── gihyo.ts         # 技術評論社
│   │       ├── ipa.ts           # IPA (情報処理推進機構・アーカイブ刊行物)
│   │       ├── lambdanote.ts    # ラムダノート
│   │       ├── leanpub.ts       # Leanpub (海外・セルフ出版・DRM-free)
│   │       ├── manatee.ts       # マナティ (マイナビ出版直販)
│   │       ├── maruzen-publishing.ts  # 丸善出版
│   │       ├── optronics.ts     # オプトロニクス社
│   │       ├── oreilly-japan.ts # オライリー・ジャパン
│   │       ├── peaks.ts         # PEAKS
│   │       ├── personal-media.ts  # パーソナルメディア
│   │       ├── pragprog.ts      # Pragmatic Bookshelf (海外・DRM-free)
│   │       ├── rutles.ts        # ラトルズ
│   │       ├── saiensu.ts       # サイエンス社
│   │       ├── seshop.ts        # SEshop (翔泳社)
│   │       ├── tatsu-zine.ts    # 達人出版会
│   │       ├── techbookfest.ts  # 技術書典
│   │       └── registry.ts      # 出版社リスト (DEFAULT_PUBLISHERS)
│   ├── application/
│   │   ├── search-books.ts   # 横断検索・スケジューリング・matchScore 付与
│   │   ├── get-book-detail.ts
│   │   ├── get-book-by-isbn.ts
│   │   ├── resolve-book.ts   # 手がかり→正規1冊の同定 (resolveBook/resolveBooks・validation)
│   │   └── concurrency.ts    # mapWithConcurrency / withTimeout
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

### 国内出版社

| ID | 名称 | 取得方式 | 備考 |
|----|------|---------|------|
| `book-tech` | BOOK TECH | HTML scraping | カラーミーショップ |
| `born-digital` | ボーンデジタル | HTML scraping | カラーミーショップ・EUC-JP エンコード必須 |
| `c-r` | C&R研究所 | HTML scraping | 公式サイトを正典に取得・通販は本の森.JP(manatee)に統合・価格は税抜表記 |
| `coronasha` | コロナ社 | HTML scraping | 電子版フラグで絞り込み・外部ストアへ委託販売 |
| `cq-publishing` | CQ出版社 | HTML scraping | 電子書籍直販サイト「Tech Village」・検索キーワードはパスに埋め込む |
| `gihyo` | 技術評論社 | JSON API | `/api_gh/site/search` |
| `ipa` | IPA（情報処理推進機構） | HTML scraping | アーカイブ刊行物・検索APIなし・全一覧をローカルフィルタ・無償PDF（DRMフリー） |
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

### 海外出版社

価格は USD（`BookRecord.currency: "USD"`）、`language: "en"`。

| ID | 名称 | 取得方式 | 備考 |
|----|------|---------|------|
| `pragprog` | Pragmatic Bookshelf | JSON index | 米国・`/search/index.json` をローカルフィルタ・DRM-free |
| `leanpub` | Leanpub | HTML scraping | 米国・セルフ出版・DRM-free・価格/日付は埋め込みJSONストリームから取得 |

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

**C&R研究所 (c-r)** — 公式サイト ＋ 本の森.JP
```
GET https://www.c-r.com/book/listthum/index?word={UTF-8 percent-encoded keyword}&sflg=1
```
- 公式サイト `c-r.com` を**正典**として書誌を取得（出版社名は常に `"C&R研究所"`）。自社通販「本の森.JP」は
  マイナビ出版の manatee 基盤（`book.mynavi.jp/manatee/c-r/`）に統合されており、アカウントも共通
- 検索フォームは `method=post`（`sflg=1` hidden ＋ `word`）だが GET でも同結果のため `fetchText`(GET) で叩く
- 検索結果: `div.clearfix`（書影 `.fll img` ＋ 本文 `.flr > .book02`）が 1 件。`p.book05 a` がタイトル/リンク、
  同 `.book02` 内のテキストから `■価格：`・`■ISBN`・`■著者：`（`／`等で複数分割）を正規表現で抽出
- 詳細ページ `/book/detail/{id}`: `p.book_s_title`(書名)・`div.book_s02`(価格/ISBN/著者)・`p.book_s01`先頭(紹介文)・
  `div.book_s03` の本の森.JP(manatee) リンクを ebookStore に充てる。**発行日は公式ページに無い**（openBD 補完に委ねる）
- **価格は税抜表記**（`2,720円＋税`）。書籍は標準税率のため `floor(本体 × 1.1)` で税込整数に換算（例 2720→2992）
- DRM: `"social"`（本の森.JP は manatee 基盤・購入者情報透かし入りPDF）。詳細ページの Amazon リンクは紙版、
  `c-r.com/bookreader/` は試し読みビューアーなので ebookStore には含めない

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

**CQ出版社 (cq-publishing)** — Tech Village 書庫＆販売
```
GET https://cc.cqpub.co.jp/lib/system/doclib_search/q={UTF-8 percent-encoded keyword}/
```
- CQ出版の電子書籍直販サイト（`cc.cqpub.co.jp/lib/`）。物販サイト `shop.cqpub.co.jp` とは別ドメインで、後者は紙の書籍・雑誌のみ・ネイティブ検索なし
- 検索キーワードは CakePHP の名前付きパラメータとして**パスに埋め込む**（`?q=` ではない）。複数語はスペース区切り（OR検索）
- 検索結果: `ul.itemList.books04 li` の `.mainTitle a`（タイトル・リンク）・`.subTitle`・`.price span`・`dt img`
- 詳細ページ: `/lib/system/doclib_item/{id}/`。`table[summary='商品詳細']` の th/td から著者・発行元・価格（ライセンス料金）・発行日を取得。**ISBN は持たず**コンテンツコード（例 `DP45551`）のみ
- タイトル末尾の形式マーカー `【PDF版】`（重複表記あり）・`【EPUB版】` 等を除去
- DRM: `"social"`（2017年導入の電子透かしで購入者情報を埋め込み、標準PDFビューアで閲覧可）

**技術評論社 (gihyo)** — JSON API
```
GET https://gihyo.jp/api_gh/site/search?search={keyword}&limit={n}
```
レスポンス: `list[isbn]` オブジェクト。`author` は `{ 役割: { 名前: "<ruby>markup</ruby>" } }` 形式なのでHTML除去が必要。

**IPA / 情報処理推進機構 (ipa)** — アーカイブ刊行物・ローカルフィルタ
```
GET https://www.ipa.go.jp/archive/publish/index.html   # 書籍・刊行物一覧（カタログ）
```
- 検索APIなし。`ul.archive-list li a` の書籍・刊行物一覧をタイトルでローカルフィルタ（`scale: "minor"`・全カタログを長期キャッシュ）。著者のみ検索は非対応
- 一覧は2階層: リンクの class が `icon--folder` のもの（情報セキュリティ白書・ソフトウェア開発データ白書）はサブ一覧ページなので1階層だけ展開して子の書籍リンク（`icon--webpage`）を取り込む
- マッチした各エントリの詳細ページを取得し `dl.data-list`（`dt.data-list__ttl__inner` / `dd.data-list__data`）から発行日・ISBN・定価を抽出。書名は `h1.ttl.--lv1`、書影は `.img-box img`、紹介文は先頭の `p.article-txt`（注意書き「本ページの情報は…」は除外）。`data-list` を持たない補助ページ（FAQ・ダウンロード案内）は書籍でないため `null` 扱いで除外
- **無償PDF・技術的DRMなし** → `ebookStores` は `{ name: "IPA", drm: "free" }` 固定（本事業終了に伴い紙の販売は終了、PDFのみ無償配布）
- ISBN-10（旧刊。例 `4-274-50026-8`）は 978 プレフィックス＋チェックディジット再計算で ISBN-13 に変換する
- 定価は税込整数へ換算: `税込`表記はそのまま、`税抜`表記（例 `本体300円（税抜）`）は `floor(本体 × 1.1)`、`定価：2,200円（本体価格2,000 円＋税10％）`は先頭の税込総額を採る
- 出版社名は常に `"IPA"`（SEC BOOKS の一部は発行がオーム社等だが、IPA アーカイブの無償配布物として統一）。著者は一覧・詳細とも個人名を持たないため空配列（openBD が ISBN で補完）

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

**Pragmatic Bookshelf (pragprog)** — 海外（米国）・JSONインデックス
```
GET https://pragprog.com/search/index.json   # 全書籍インデックス（lunr.js 用）
```
- 唯一の海外（英語）出版社。サイト内検索は lunr.js のクライアントサイド検索なので、インデックス JSON を取得して**ローカルフィルタ**する
- インデックスの各レコード: `record_type`（`"book"`/`"errata"`）・`href`・`title`・`subtitle`・`author`・`keywords[]`・`code`・`image`。`"book"` のみ対象
- 検索: タイトル語は title+subtitle+keywords に全トークン一致、著者は `author` 部分一致。インデックスに価格・ISBN・発行日はない
- 詳細: `/titles/{code}/{slug}/`。`<meta property="book:isbn|book:author|og:*">` と `.book-about-text`（"Published: July 2026" → `2026-07-01`）・`.buybox`（"$39.95 (USD)"）から取得
- 著者: "A with B, C, and D" を `with`/`and`/カンマで分割（オックスフォードカンマの "and" 残りも除去）
- 価格は **USD** なので `price` に数値・`currency: "USD"` を付与
- DRM: `"free"`（PDF/epub/mobi 全フォーマット提供・技術的DRMなし）

**Leanpub (leanpub)** — 海外（米国）・セルフ出版プラットフォーム
```
GET https://leanpub.com/store?search={keyword}   # サーバーレンダリングのストア検索
```
- 海外のセルフパブリッシング・プラットフォーム。React Router (Remix系) アプリだが、ストア検索結果は静的HTMLでレンダリングされる
- 検索結果: 書影付き `<li>`（書影 `cloudfront.net/{slug}/s_featured`）を走査。slug は書影URLから取得し、`a[href="/{slug}"]` のテキストをタイトル、`.text-neutral-500` を著者、`.italic` をサブタイトルとして取得
- 詳細 `/{slug}`: タイトル・著者・説明・書影は `<meta property="og:*">`・`<meta name="author">` から取得
- **価格・更新日は埋め込み React Router ストリーム（`<script>`内）から正規表現で取得**: `minimumPaidPrice\",{数値}`（最低価格）・`lastPublishedAt\",\"{YYYY-MM-DD}`。静的HTMLの表示テキスト（"Last updated on ..." 等）は CDN/SSR 状態で揺れて不安定なため使わない
- 価格は pay-what-you-want の**最低価格**・**USD**（`currency: "USD"`）。ISBN は持たない
- DRM: `"free"`（PDF/EPUB、技術的DRMなし）。`publisher` はセルフ出版のため `"Leanpub"`

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
| Pragmatic Bookshelf | `free` | PDF/epub/mobi 全フォーマット提供・DRMなし |
| Gihyo Digital Publishing | `social` | 公式方針 |
| SEshop (翔泳社) | `social` | メールアドレス埋め込み透かし |
| BOOK TECH | `social` | 購入者情報透かし |
| ボーンデジタル | `social` | PDFにメールアドレス印字 |
| CQ出版 Tech Village | `social` | 2017年導入の電子透かしで購入者情報を埋め込み |
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
| `get_book_by_isbn` | ISBNから書誌情報取得（openBD→出版社サイト→カーリル） | `isbn` |
| `resolve_book` | 手がかり（ISBN/書名/著者）から正規の1冊を確信度つきで同定 | `isbn?`, `title?`, `author?`, `publisher?` |
| `resolve_books` | `resolve_book` のバッチ版（入力順に結果配列を返す） | `books[]` |
| `list_publishers` | 対応出版社一覧 | なし |

## 検索の挙動

利用エージェント側の試行錯誤を減らすため、`search_books` は以下の前処理・後処理を行う。

- **ベストマッチ順ソート**: 各候補にクエリとの一致度 `matchScore`（0〜1、1が完全一致）を付与し降順に並べる。
  先頭ほど本命候補なので、PDF奥付から推定した曖昧な title/author でも候補選びに迷わない。
  スコアは `src/domain/text-match.ts` の `normalizeForMatch()`（NFKC で全半角統一・装飾括弧/長音/約物/空白を除去）＋
  書名はクエリを空白でトークン分割して候補書名への包含割合で算出する（純日本語の部分語が助詞を跨いでも拾える）。
  `matchScore` はクエリ相対値のためドメインの `BookRecord` には載せず、検索結果境界の `ScoredBook` 型に限定する
- **ゼロ関連度のフォールバックを除外**: クエリ語があるのに `matchScore` が 0 の候補（検索サイトが「該当なし」時に返す新着順の無関係本）は除外する。
  「該当なし」を空配列で表し、「該当なし」と「誤ヒット」を呼び出し側が区別できるようにする（誤メタデータ混入を防ぐ）
- **著者の重複排除**: `src/domain/authors.ts` の `dedupeAuthors()` で著者配列の重複を除く（`normalizeForMatch` をキーに表記ゆれも同一視）。search/detail/isbn の全経路に適用
- **openBD による欠損補完**: ISBN を持つ結果は `enrichWithOpenBD()` で `authors`（空のとき）・`publishedAt`・`price`・`coverImageUrl`・`description` を補完する。出版社の検索APIが著者や紹介文を返さない場合の救済（アダプタ間の取得項目の不揃いを平準化）
- **大規模出版社を優先スケジュール**: `PublisherAdapter.scale === "minor"` の小規模・専門/ローカルフィルタ型サイトは大規模出版社の後に回す。
  小規模サイトのカタログは変動が少ないため `CATALOG_CACHE_TTL_SECONDS`（24時間）で全キャッシュし、ライブ負荷を抑える
- **並列度制限・タイムアウト**: `src/application/concurrency.ts` の `mapWithConcurrency`（`SEARCH_CONCURRENCY = 6`）と
  `withTimeout`（`SEARCH_TIMEOUT_MS = 12s`）で、遅い1社が全体をブロックしないようにする（部分結果を返す）
- **errors の集約**: 失敗理由を `type`（`robots` / `timeout` / `http` / `other`）に分類し、MCP 層で種別×出版社に集約して静音化する
- **ISBN ショートカット**: `title` が ISBN 形式（`src/domain/isbn.ts` の `looksLikeIsbn`）かつ `author` 未指定なら、
  全社横断をやめて `get_book_by_isbn` 経路に振り分ける
- **書名の正規化（出力境界）**: スクレイピング由来の生改行・連続空白が `title` に残ることがあるため、
  MCP 層 `formatBook()`（`src/mcp/server.ts`）で `collapseWhitespace()`（`src/domain/title.ts`）を全ソース統一適用する。
  openBD の ISBD 表記書名（`"本タイトル = 並列タイトル : 副題"`）は `parseBibliographicTitle()` で構造化し、
  `BookRecord.subtitle`（`" : "` 区切り）・`BookRecord.alternativeTitle`（`" = "` 区切り・別言語タイトル）へ分離する
  （`openBDEntryToBookRecord` で適用。スペースを伴わない書名内のコロン等は誤分割しない）

## 同定の挙動（resolve_book / resolve_books）

`resolve_book` は Riida の `read_pdf_colophon` が抽出した曖昧な手がかり（ISBN・書名・著者）を
**正規の1冊へ確信度つきで解決する**ための統合ツール。`isbn` / `title` / `author` のいずれかが必須。
実装は `src/application/resolve-book.ts`。

- **解決経路**: `isbn` があれば `resolveByIsbn`（openBD→出版社サイト→カーリル）で解決。解決できない、
  または ISBN が無い場合は横断検索（`searchBooks`）の `matchScore` でベストマッチを採る。
  上位2件が拮抗（差 < `AMBIGUOUS_GAP`）なら `status="ambiguous"` で候補（`candidates`）を返す。
- **返り値（source 非依存で固定）**: `status`（`matched`/`ambiguous`/`not_found`）・`confidence`（`high`/`medium`/`low`）・
  `book`（`not_found` 時 `null`）・`matchScore`・`source`・`validation`・`reason?`・`candidates?`。
  `book` は素の `BookRecord`（top-level `matchScore` と重複させないため `ScoredBook` の `matchScore` は落とす。
  `candidates` は候補ごとの比較に使うため `matchScore` 付きのまま）。
- **`validation`（`book !== null` なら常時付与・source 非依存）**: 与えた手がかりと返却本の照合結果。
  評価できない項目は `null` で明示する（統一的にパースできるように）。
  - `isbnMatches`: 要求ISBN と返却 `book.isbn` の一致（ISBN 未指定なら `null`）。
    **`false` は「要求ISBNは解決できず、書名一致で代替候補を返している」警告**で、このとき `confidence` は `high` にしない（黙った版すり替えの防止）。
  - `isbnTitleAgree` / `titleExact` / `sameWork`: 書名の同一作品らしさ（`title` 未指定なら `null`）。
    `sameWork ≈ 0` かつ `titleExact=false` は誤ISBN（別作品）の疑い。
  - `editionDiffers`: 同一作品だが版表記が異なる可能性。**ISBN が一致しているときは版が確定するため常に `false`**
    （版表記の差は `titleExact=false` で表す）。
- **`reason`**: `not_found` の理由、または ISBN フォールバックで別ISBNを返した際の警告文（要求ISBNを明示）。

## カバレッジの制約

各アダプターは出版社の**現行ストアの生カタログ**（検索結果ページ・電子書籍一覧・JSON索引）をスクレイプする。
このため、出版社がストアから**販売終了・取り下げした旧刊**は構造的に `search_books` でヒットしない。
共通パターンは2008〜2013年頃の短編・電子書籍専売タイトル。書籍自体は実在するが、現行の検索可能な索引のどこにも載っていない。

riida-mcp フィードバック「現象9」で報告された未ヒット例の調査結果（2026-06-02 確認）:

- **オライリー・ジャパン（旧刊 Ebook版のみタイトル）**: `CSS3の値、単位、色`（9784873116266）・`セレクタ、詳細度、カスケード`（9784873116037）・
  `D3をはじめよう`（9784873115979）・`Web Workers`（9784873115962）・`OAuth 2.0をはじめよう`（9784873115580）・
  `PHP開発者のためのJavaScript`（9784873116433）等。
  これらは `/books/{isbn}/` の詳細ページは生きている（HTTP 200）が、`oreilly-japan` がフィルタする `/ebook/` 一覧
  （現行ストアで販売中の約580冊）にも `/catalog/`・カテゴリページ（`/books/{topic}/`）にも載っていない。
  詳細ページの `buying-options` は空（=現行ストアで購入導線なし。og:description に「本書はEbook版のみの販売となります」と残るが実売は終了）。
  `sitemap.xml` も無く（404）、旧刊を網羅する代替の生インデックスは存在しない → **一覧ソースの差し替えでは救済不能**。
  さらにこれら電子書籍専売 ISBN は openBD にも未登録（紙流通前提の JPRO/openBD に載らない）なため、
  `search_books` だけでなく `get_book_by_isbn` の通常経路（openBD → カーリル）でも失敗する。
- **翔泳社 / SEshop（旧刊）**: `レガシーソフトウェア改善ガイド`・`実用Common Lisp`・`初めての人のためのLISP［増補改訂版］`・
  `エンジニアのための文章術 再入門講座 新版` 等。SEshop 検索（全カテゴリ）でそもそも 0 件＝**ストアに商品ページ自体が残っていない**
  （O'Reilly と違い詳細ページも消えている）。電子版が存在しないか取り下げ済みで、`seshop` アダプタの取りこぼしではない。

### 旧刊救済: ISBN からの詳細ページ直引き（`detailUrlForIsbn`）

部分的な救済余地があるのはオライリーのみ。詳細ページ `/books/{isbn}/` が生きているため、以下を実装済み:

- `PublisherAdapter.detailUrlForIsbn?(isbn)`（任意メソッド）— ISBN ベースの安定 URL を持つサイトが詳細ページ URL を構成する。
  `oreilly-japan` が `/books/{isbn}/` を返す。
- `isbn-publisher-codes.ts` の `oreilly-japan` に旧記号 `87311` を追加（従来は新記号 `8144` のみ）。
- `get_book_by_isbn` は openBD ミス時、カーリルより先に `detailUrlForIsbn` 経路（robots.txt 確認 → `getDetail`）を試みる
  （`fetchDetailByIsbnCode`）。これで `CSS3の値、単位、色`（9784873116266）等は**価格を除く書誌**（書名・著者・発行日・説明・書影）が回収できる。
  価格は詳細ページの `buying-options` が空のため取得不可。

ただし `search_books`（横断検索）では依然ヒットしない（`/ebook/` 一覧に無いため）。回収には ISBN が分かっている必要がある。
SEshop 旧刊は詳細ページごと消えているため `detailUrlForIsbn` でも回収不能。

## 新しいアダプターの追加手順

1. `src/adapters/publishers/{id}.ts` を作成し `PublisherAdapter` を実装
   - `search()`: 検索APIまたはHTMLスクレイピングで `BookRecord[]` を返す
   - `getDetail()`: 詳細ページをスクレイピングして `BookRecord` を返す
   - 海外出版社など日本語以外なら `language`（ISO 639-1）を宣言する（省略時はアプリ層で `"ja"` とみなす）
   - ラインナップが小さい/検索APIがなく全カタログをローカルフィルタするサイトは `scale: "minor"` を宣言し、
     カタログ取得を `fetchText(url, deps, undefined, CATALOG_CACHE_TTL_SECONDS)` で長期キャッシュする
2. `tests/fixtures/{id}-search.html` (または `.json`) を作成
3. `tests/fixtures/{id}-detail.html` を作成
4. `tests/unit/adapters/publishers/{id}.test.ts` を作成
5. 必要なら `base.ts` の `EBOOK_STORE_PATTERNS` にストアパターンを追加
6. `src/adapters/publishers/registry.ts` に登録

よく使う共通ユーティリティ (`base.ts`):
- `fetchText(url, deps, extraHeaders?, ttlSeconds?)` — キャッシュ付きHTTP GET（`ttlSeconds` 省略時 1時間、小規模カタログは `CATALOG_CACHE_TTL_SECONDS`）
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
