# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.4...HEAD
[0.2.4]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/zonuexe/techbook-mcp/releases/tag/v0.2.0
