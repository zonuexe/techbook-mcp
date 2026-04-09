# techbook-mcp — Claude Code 向けガイド

@docs/design-doc.md

## 開発コマンド

```bash
npm test           # ユニットテスト実行 (Vitest)
npm run build      # TypeScript コンパイル → dist/
```

## コーディング規約

- **新しいアダプターを追加するときは必ずテストも書く**（`tests/unit/adapters/publishers/{id}.test.ts`）
- テストは `MockHttpClient` + `NullCacheStore` + `CheerioHtmlParser` の組み合わせで書く
- 一般的なフィクスチャHTMLは `tests/fixtures/` に配置し、実サイトの構造を忠実に再現する
- `fetchText()` はキャッシュ・ヘッダーを内包するため、アダプター内では直接 `deps.http.get()` を呼ばない
- Referer ヘッダーが必要なサイトは `fetchText(url, deps, { Referer: "..." })` の第3引数を使う
- 著者名から役割語（著・訳・編・監修・監訳など）を除去すること
- 価格は税込み整数（円）で `BookRecord.price` に格納する
- `publisher` フィールドには実際の出版社名を入れる（ストアプラットフォーム名ではない）

## DRM 分類の判断基準

新しいストアを `EBOOK_STORE_PATTERNS` に追加する際の判断順:
1. **free** — 公式が明言、または購入して透かし等がないことを確認済み
2. **social** — 購入者情報（メールアドレス等）が埋め込まれるが技術的制限なし
3. **password_pdf** — PDFにパスワードがかかる（標準ビューアで開ける）
4. **drm** — 専用ビューアーが必要、または上記いずれでもない場合

## よくある落とし穴

- **EUC-JP サイト**: `shop.rutles.net` はクエリを EUC-JP エンコードしないとヒットしない → `iconv-lite` を使用
- **XSRF-TOKEN**: `techbookfest.org` GraphQL はダブルサブミットCookieパターン必須
- **Referer 必須**: `maruzen-publishing.co.jp` の検索は Referer なしで 403
- **機関向けストア除外**: `kw.maruzen.co.jp`（Knowledge Worker）は個人向けではないため除外
- **ローカルフィルタ**: `oreilly-japan` と `peaks` は検索APIがなくトップページ/一覧をローカルフィルタ
- **著者のみ検索不可**: ローカルフィルタ型アダプターは `!query.title` のとき `[]` を返す（HTTP呼ばない）
