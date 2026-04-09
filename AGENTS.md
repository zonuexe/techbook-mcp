# techbook-mcp — AI エージェント向けガイド

日本語技術書の書誌情報を出版社公式サイト・APIから取得するMCPサーバー。
詳細な設計は [docs/design-doc.md](docs/design-doc.md) を参照。

## 開発コマンド

```bash
npm install
npm test           # ユニットテスト実行 (Vitest)
npm run build      # TypeScript コンパイル → dist/
```

## コーディング規約

- **新しいアダプターを追加するときは必ずテストも書く**（`tests/unit/adapters/publishers/{id}.test.ts`）
- テストは `MockHttpClient` + `NullCacheStore` + `CheerioHtmlParser` の組み合わせで書く
- フィクスチャHTMLは `tests/fixtures/` に配置し、実サイトの構造を忠実に再現する
- `fetchText()` はキャッシュ・ヘッダーを内包するため、アダプター内では直接 `deps.http.get()` を呼ばない
- Referer ヘッダーが必要なサイトは `fetchText(url, deps, { Referer: "..." })` の第3引数を使う
- 著者名から役割語（著・訳・編・監修・監訳など）を除去すること
- 価格は税込み整数（円）で `BookRecord.price` に格納する
- `publisher` フィールドには実際の出版社名を入れる（ストアプラットフォーム名ではない）

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

```typescript
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
```

## よくある落とし穴

- **EUC-JP サイト**: `shop.rutles.net` はクエリを EUC-JP エンコードしないとヒットしない → `iconv-lite` を使用
- **XSRF-TOKEN**: `techbookfest.org` GraphQL はダブルサブミットCookieパターン必須
- **Referer 必須**: `maruzen-publishing.co.jp` の検索は Referer なしで 403
- **機関向けストア除外**: `kw.maruzen.co.jp`（Knowledge Worker）は個人向けではないため除外
- **ローカルフィルタ型**: `oreilly-japan` と `peaks` は検索APIがなくトップページ/一覧をローカルフィルタ
- **著者のみ検索不可**: ローカルフィルタ型アダプターは `!query.title` のとき `[]` を返す（HTTP呼ばない）
