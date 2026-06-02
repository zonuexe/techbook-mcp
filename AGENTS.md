# techbook-mcp — AI エージェント向けガイド

日本語技術書の書誌情報を出版社公式サイト・APIから取得するMCPサーバー。
詳細な設計は [docs/design-doc.md](docs/design-doc.md) を参照。

## コミットメッセージ規約

Conventional Commits は使わない。コミットメッセージは端的な日本語または英語の命令形で書く。

```
robots.txt チェックを追加し結果を6時間キャッシュする
Add robots.txt check with 6-hour cache
```

## 開発コマンド

```bash
npm install
npm test           # ユニットテスト実行 (node:test)
npm run build      # TypeScript コンパイル → dist/
```

## コーディング規約

- **新しいアダプターを追加するときは必ずテストも書く**（`tests/unit/adapters/publishers/{id}.test.ts`）
- テストは `MockHttpClient` + `NullCacheStore` + `CheerioHtmlParser` の組み合わせで書く
- フィクスチャHTMLは `tests/fixtures/` に配置し、実サイトの構造を忠実に再現する
- `fetchText()` はキャッシュ・ヘッダーを内包するため、アダプター内では直接 `deps.http.get()` を呼ばない
- Referer ヘッダーが必要なサイトは `fetchText(url, deps, { Referer: "..." })` の第3引数を使う
- 著者名から役割語（著・訳・編・監修・監訳など）を除去すること
- 価格は税込み整数（円）で `BookRecord.price` に格納する。海外出版社など円以外の通貨は `price` に当該通貨の数値、`currency` に ISO 4217 コード（例 `"USD"`）を入れる（`currency` 省略時は JPY とみなす）
- `publisher` フィールドには実際の出版社名を入れる（ストアプラットフォーム名ではない）
- 日本語以外の書籍を扱うアダプターは `language`（ISO 639-1）をレコードまたはアダプターに設定する。国内出版社は省略可（アプリ層が `"ja"` を補う）
- 小規模・ローカルフィルタ型アダプターは `scale: "minor"` を宣言し、全カタログ取得を `fetchText(url, deps, undefined, CATALOG_CACHE_TTL_SECONDS)` で長期キャッシュする（大規模出版社の後にスケジュールされる）
- 検索結果の `matchScore` はアプリ層（`search-books.ts`）で付与する。クエリ相対値なのでアダプターでは設定しない（`BookRecord` ではなく `ScoredBook` の責務）

## 新しい出版社アダプターを追加するとき

`docs/design-doc.md` の「新しいアダプターの追加手順」を参照。要点は以下:

1. `src/adapters/publishers/{id}.ts` — `PublisherAdapter` インターフェースを実装
2. `tests/fixtures/{id}-search.html` + `{id}-detail.html` — 実サイトHTMLのスナップショット
3. `tests/unit/adapters/publishers/{id}.test.ts` — `MockHttpClient` でユニットテスト
4. `src/adapters/publishers/base.ts` — 必要に応じて `EBOOK_STORE_PATTERNS` に追加
5. `src/adapters/publishers/registry.ts` — `DEFAULT_PUBLISHERS` に登録

## DRM 分類の判断基準

新しいストアを `EBOOK_STORE_PATTERNS` に追加する際の判断順:
1. **free** — 公式が明言、または購入して透かし等がないことを確認済み
2. **social** — 購入者情報（メールアドレス等）が埋め込まれるが技術的制限なし
3. **password_pdf** — PDFにパスワードがかかる（標準ビューアで開ける）
4. **drm** — 専用ビューアーが必要、または上記いずれでもない場合

## アーキテクチャ上の制約

- ポート (`HttpClient`, `HtmlParser`, `CacheStore`) はインターフェースのみ。実装を直接 import しない
- `DrmType` に新しい値を追加するときは `src/domain/book.ts` と `src/mcp/server.ts` の両方を更新する

## テスト方針

テストフレームワークは `node:test` + `node:assert/strict` を使う（vitest は使わない）。

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// 標準的なテストセットアップ
function makeDeps(http: MockHttpClient) {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

// GET のモック（URL前方一致）
const http = new MockHttpClient()
  .addResponse("https://example.com/search", { status: 200, body: html });

// POST のモック (GraphQL等)
const http = new MockHttpClient()
  .addPostResponse("https://api.example.com/graphql", { status: 200, body: json });

// vitest → node:assert の主な対応
// expect(x).toBe(y)          → assert.strictEqual(x, y)
// expect(x).toEqual(y)       → assert.deepStrictEqual(x, y)
// expect(x).toMatchObject(y) → assert.partialDeepStrictEqual(x, y)
// expect(x).toHaveLength(n)  → assert.strictEqual(x.length, n)
// expect(x).toContain(s)     → assert.ok(x.includes(s))
// expect(x).toMatch(/r/)     → assert.match(x, /r/)
// await expect(p).rejects.toThrow("msg") → await assert.rejects(p, /msg/)

// モック関数: node:test の mock.fn() は Bun 非対応のため、テストファイル内に
// ローカルで mockFn() ヘルパーを定義して使う（Node.js・Bun・Deno 共通で動作）
// vi.fn().mockResolvedValue(v) → mockFn(async () => v)
// fn.toHaveBeenCalledOnce()    → assert.strictEqual(fn.mock.callCount(), 1)
```

## よくある落とし穴

- **EUC-JP サイト**: `shop.rutles.net`・`wgn-obs.shop-pro.jp`（ボーンデジタル）はクエリを EUC-JP エンコードしないとヒットしない → `encodeEucJp()` を使用。**レスポンスも EUC-JP**（`charset=EUC-JP`）。`fetch().text()` は常に UTF-8 解釈で文字化けするため、`FetchHttpClient.text()` が Content-Type の charset を見て `iconv-lite` でデコードし直す（非UTF-8レスポンス全般に対応）
- **XSRF-TOKEN**: `techbookfest.org` GraphQL はダブルサブミットCookieパターン必須
- **Referer 必須**: `maruzen-publishing.co.jp` の検索は Referer なしで 403
- **機関向けストア除外**: `kw.maruzen.co.jp`（Knowledge Worker）は個人向けではないため除外
- **ローカルフィルタ型**: `oreilly-japan` と `peaks` は検索APIがなくトップページ/一覧をローカルフィルタ
- **著者のみ検索不可**: ローカルフィルタ型アダプターは `!query.title` のとき `[]` を返す（HTTP呼ばない）
- **パス埋め込み検索**: `cc.cqpub.co.jp`（CQ出版 Tech Village）は検索語を `?q=` ではなくパス末尾 `doclib_search/q={encoded}/` に埋め込む。物販サイト `shop.cqpub.co.jp` は別物（紙のみ・電子書籍なし）
- **JSONインデックス型**: `pragprog.com`（Pragmatic Bookshelf, 海外）は `/search/index.json`（lunr.js 用全書籍インデックス）を取得してローカルフィルタ。価格は USD なので `currency: "USD"` を付与
- **検索結果は matchScore 降順**: `search_books` はアプリ層で各候補に `matchScore`（0〜1）を付与しベストマッチ順にソートする（`src/domain/text-match.ts`）。アダプターの返却順には依存しない
- **ISBN ショートカット**: `search_books` の `title` が ISBN 形式（`looksLikeIsbn`）かつ `author` 未指定だと、横断検索せず `get_book_by_isbn` 経路に振り分けられる（MCP ハンドラ `src/mcp/server.ts`）
- **遅いサイトはタイムアウト**: 横断検索は 1社あたり `SEARCH_TIMEOUT_MS`(12s) で打ち切り部分結果を返す。並列度は `SEARCH_CONCURRENCY`(6)。`scale: "minor"` は大規模出版社の後に回る（`src/application/search-books.ts` / `concurrency.ts`）
- **埋め込みストリームから価格取得**: `leanpub.com`（海外）は React Router アプリ。検索結果カードは静的HTMLだが、価格(`minimumPaidPrice`)・更新日(`lastPublishedAt`)は `<script>` 内のストリームから正規表現で取得する。静的な表示テキスト（"Last updated on …"）は CDN/SSR 状態で揺れるため使わない
