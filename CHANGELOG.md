# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 役割つきの著者情報 `BookRecord.contributors`（`{ name, role }[]`、role は `author`/`translator`/`supervisor`/`editor`）を追加。openBD の ONIX `Contributor` から取得し、`PersonName`（"姓, 名"形式）を整形（西洋名は "First Last"、和名は "姓 名"）する。`authors`（フラット配列・後方互換）も ONIX 由来のクリーンな名前で埋める
- `resolve_book` の `validation` を拡張：`titleExact` / `sameWork`（同一作品らしさ 0..1、版表記を畳んで照合）/ `editionDiffers`（同一作品だが版表記が異なる）を追加。同一作品の版違いと「誤ISBN（別作品）」を呼び出し側が区別できる（`isbnTitleAgree` は後方互換のため維持）

### Changed

- openBD 由来の著者を `summary.author`（生年・出版社が混入しがち）ではなく ONIX `Contributor` から取得するようにし、`["Boswell","Dustin Foucher",…]` のような分割・混入を解消
- 出版社ページに既にある Amazon 購入動線（`ebookStores` の Amazon リンク）から `asin` を自動導出するようにし、より多くの書籍で ASIN を返す（追加の HTTP リクエストなし。Kindle の ASIN を紙の ASIN=ISBN-10 より優先）
- 技術評論社（gihyo）の `get_book_detail` が電子版ページ（`/dp/ebook/`）でも公式の `/book/` ページを辿って ASIN・電子書籍ストアを取得するようにした（電子版ページには Amazon 動線が無いため）
- マナティ（manatee）の `get_book_detail` が、Amazon 動線が無い電子直販ページから公式のマイナビブックスEC（`/ec/products/`）ページを辿って ASIN を取得するようにした

### Fixed

- 技術評論社（gihyo）の `get_book_detail` で、電子版 ISBN（`/dp/ebook/`）を渡すと API が紙版 ISBN をキーに返すためにエントリ取得に失敗していた問題を修正（キー不一致時は先頭エントリを採用）

## [0.3.3] - 2026-06-03

### Added

- `resolve_book` ツールを追加。手がかり（ISBN・書名・著者）から正規の1冊を確信度つきで同定する。ISBN があれば openBD→出版社→カーリルで解決し、title も渡すと解決結果と照合して版違い・誤ISBN を検出する（`validation.isbnTitleAgree`）。返り値に `status`（matched/ambiguous/not_found）・`confidence`（high/medium/low）・`source` を含み、自動採用の可否を判断しやすくする
- `resolve_books` ツールを追加（`resolve_book` の一括版）。ローカル蔵書への一括メタデータ付与向けに、入力順に揃った結果配列を返す

### Fixed

- 一部の実行環境・プロキシ環境で HTTP レスポンスの `Content-Encoding: gzip` が自動解凍されず、gzip の生バイトを `JSON.parse`／HTML パースしてエラーや空結果になる問題を修正（`get_book_by_isbn` が「is not valid JSON」で失敗、JSON API 系アダプタがエラー、HTML ローカルフィルタ型が無言で 0 件になる等）。gzip マジックバイトを検出した場合は手動で解凍するフォールバックを追加
- `build` がコンパイル前に `dist/` をクリーンするようにし、ソース削除後の古い生成物が npm パッケージに混入しないようにした

## [0.3.2] - 2026-06-03

### Fixed

- SEshop（翔泳社）の `search_books` 結果に著者・ISBN・紹介文が含まれていなかった問題を修正（検索結果の各書籍について詳細ページから著者・ISBN・紹介文を補完する。ISBN が付くことで openBD による補完も有効になる）

## [0.3.1] - 2026-06-02

### Fixed

- MCP サーバーがクライアントに申告する `version` が実際のパッケージバージョンと一致せず `0.1.0` に固定されていた問題を修正（HTTP `User-Agent` も同様に固定されていた。`src/version.ts` の単一定数を参照するよう一元化）

## [0.3.0] - 2026-06-02

### Added

- CQ出版社 (`cq-publishing`) アダプターを追加（電子書籍直販サイト Tech Village）
- Pragmatic Bookshelf (`pragprog`) アダプターを追加（海外・DRM-free）
- Leanpub (`leanpub`) アダプターを追加（海外・セルフ出版・DRM-free）
- 海外出版社の価格に対応する `BookRecord.currency`（ISO 4217、省略時は JPY）を追加
- 書籍の言語を表す `BookRecord.language`（ISO 639-1、省略時は `ja`）を追加
- `search_books` が各候補にクエリとの一致度 `matchScore` を付与し、ベストマッチ順にソートするよう改善
- `search_books` の `title` が ISBN 形式かつ `author` 未指定のとき `get_book_by_isbn` 経路へ振り分け（ISBN ショートカット）
- `get_book_by_isbn` が openBD 未収録の旧刊でも、ISBN ベースの安定 URL を持つ出版社（O'Reilly の `/books/{isbn}/`）の詳細ページを直接取得して書誌を回収（電子書籍専売・販売終了タイトルの部分救済。価格は取得不可）

### Changed

- `search_books` は「該当なし」を空配列で返すようになり、検索サイトが該当なし時に返す無関係な新着フォールバックを除外（誤メタデータの混入を防止）
- 書名の一致をトークン分割×包含割合で評価し、純日本語の部分一致（助詞を跨ぐ部分語）を拾えるよう改善
- 検索結果の著者を search / detail / isbn の全経路で重複排除（表記ゆれも同一視）
- 出版社の検索 API が著者を返さない場合でも、ISBN があれば openBD から `authors` を補完
- 横断検索を並列度6・1社あたり12秒タイムアウトで高速化／静音化し、小規模サイトはカタログを長期キャッシュ（大規模出版社を優先）

### Fixed

- EUC-JP レスポンスをデコードし、ラトルズ・ボーンデジタルの検索結果が常に 0 件になる問題を修正（非 UTF-8 レスポンス全般に対応）

### Security

- 依存を最新メジャーへ更新し、SDK 経由の推移的脆弱性 5 件を解消

## [0.2.4] - 2026-04-19

### Added

- 日科技連出版社 (`juse-p`) アダプターを追加
- Google Books アダプター (`google-books`) を追加（APIキー未設定時は無効化）
- `techbook-mcp setup` コマンドを追加: Google Books API キーを対話入力し OS 固有の設定ディレクトリに保存
  - Linux: `$XDG_CONFIG_HOME/techbook-mcp/credentials.json`
  - macOS: `~/Library/Application Support/techbook-mcp/credentials.json`
  - Windows: `%APPDATA%\techbook-mcp\credentials.json`
- ISBN出版者記号から出版社アダプターを特定するマッピング (`PUBLISHER_ISBN_CODES`) を追加（13出版社）
- `get_book_by_isbn` が openBD の storelink に加え、ISBN出版者記号からも対応アダプターを特定して出版社サイトから直接取得を試みるよう改善

## [0.2.3] - 2026-04-13

### Added

- `get_book_by_isbn` ツールを追加（ISBNから書誌情報を取得）
- openBD にない書籍のフォールバックとしてカーリル API を追加

### Fixed

- `getDetail()` の著者取得を自己紹介文ではなく `itemprop="author"` から取得するよう修正
- `bin` エントリの `./` プレフィックスを修正

## [0.2.2] - 2026-04-12

### Fixed

- `npm publish` 前に `dist/` が自動ビルドされるよう `prepublishOnly` スクリプトを追加

## [0.2.1] - 2026-04-12

### Fixed

- 達人出版会アダプターの検索が常に無関係な書籍を返す問題を修正（`?search=` パラメータがサーバーで無視されていたため、全書籍一覧からローカルフィルタリングする方式に変更）

## [0.2.0] - 2026-04-12

### Added

- インプレスブックス (`impress-books`) アダプターを追加
- 各出版社サイトの `robots.txt` をチェックし、クロール可否を判定する機能を追加（結果は6時間キャッシュ）
- GitHub Actions に Bun・Deno のテストジョブを追加

### Fixed

- `npx` でバイナリ起動する際に shebang がなくエラーになる問題を修正

### Changed

- テストを vitest から `node:test` + `node:assert` に移行（Node.js・Bun・Deno で共通実行可能に）

[Unreleased]: https://github.com/zonuexe/techbook-mcp/compare/v0.3.3...HEAD
[0.3.3]: https://github.com/zonuexe/techbook-mcp/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/zonuexe/techbook-mcp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/zonuexe/techbook-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/zonuexe/techbook-mcp/releases/tag/v0.2.0
