# techbook-mcp — AI エージェント向けガイド

日本語技術書の書誌情報を出版社公式サイト・APIから取得するMCPサーバー。
詳細な設計はドキュメントを参照: [docs/design-doc.md](docs/design-doc.md)

## クイックスタート

```bash
npm install
npm test        # 106 tests across 12 adapters
npm run build
```

## 新しい出版社アダプターを追加するとき

`docs/design-doc.md` の「新しいアダプターの追加手順」を参照。要点は以下:

1. `src/adapters/publishers/{id}.ts` — `PublisherAdapter` インターフェースを実装
2. `tests/fixtures/{id}-search.html` + `{id}-detail.html` — 実サイトHTMLのスナップショット
3. `tests/unit/adapters/publishers/{id}.test.ts` — `MockHttpClient` でユニットテスト
4. `src/adapters/publishers/base.ts` — 必要に応じて `EBOOK_STORE_PATTERNS` に追加
5. `src/adapters/publishers/registry.ts` — `DEFAULT_PUBLISHERS` に登録

## アーキテクチャ上の制約

- アダプター内で `deps.http.get()` を直接呼ばない → `fetchText()` 経由でキャッシュを使う
- ポート (`HttpClient`, `HtmlParser`, `CacheStore`) はインターフェースのみ。実装を直接 import しない
- `DrmType` に新しい値を追加するときは `src/domain/book.ts` と `src/mcp/server.ts` の両方を更新する

## テスト方針

```typescript
// 標準的なテストセットアップ
function makeDeps(http: MockHttpClient) {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

// GET のモック
const http = new MockHttpClient()
  .addResponse("https://example.com/", { status: 200, body: html });

// POST のモック (GraphQL等)
const http = new MockHttpClient()
  .addPostResponse("https://api.example.com/graphql", { status: 200, body: json });
```

MockHttpClient はURL前方一致でマッチするため、クエリパラメータ付きURLも `addResponse("https://example.com/search", ...)` で補足できる。
