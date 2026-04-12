# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-12

### Added

- インプレスブックス (`impress-books`) アダプターを追加
- 各出版社サイトの `robots.txt` をチェックし、クロール可否を判定する機能を追加（結果は6時間キャッシュ）
- GitHub Actions に Bun・Deno のテストジョブを追加

### Fixed

- `npx` でバイナリ起動する際に shebang がなくエラーになる問題を修正

### Changed

- テストを vitest から `node:test` + `node:assert` に移行（Node.js・Bun・Deno で共通実行可能に）

[Unreleased]: https://github.com/zonuexe/techbook-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/zonuexe/techbook-mcp/releases/tag/v0.2.0
