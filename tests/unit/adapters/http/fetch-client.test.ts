import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import iconv from "iconv-lite";
import zlib from "node:zlib";
import { FetchHttpClient } from "../../../../src/adapters/http/fetch-client.js";

const realFetch = globalThis.fetch;

/** 指定バイト列と Content-Type を返すよう global fetch を差し替える */
function stubFetch(bytes: Uint8Array, contentType: string): void {
  globalThis.fetch = (async () =>
    new Response(bytes, { headers: { "content-type": contentType } })) as typeof fetch;
}

describe("FetchHttpClient", () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("EUC-JP レスポンスを正しくデコードする（ラトルズ・ボーンデジタル対応）", async () => {
    const text = "【電子版】C言語ゲームプログラミング";
    stubFetch(iconv.encode(text, "euc-jp"), "text/html; charset=EUC-JP");

    const res = await new FetchHttpClient().get("https://example.com/");

    assert.strictEqual(await res.text(), text);
  });

  it("Shift_JIS レスポンスを正しくデコードする", async () => {
    const text = "日本語テスト";
    stubFetch(iconv.encode(text, "shift_jis"), "text/html; charset=Shift_JIS");

    const res = await new FetchHttpClient().get("https://example.com/");

    assert.strictEqual(await res.text(), text);
  });

  it("UTF-8 レスポンスはそのまま返す", async () => {
    const text = "【電子版】テスト";
    stubFetch(new TextEncoder().encode(text), "text/html; charset=UTF-8");

    const res = await new FetchHttpClient().get("https://example.com/");

    assert.strictEqual(await res.text(), text);
  });

  it("charset 指定なしは UTF-8 として扱う", async () => {
    const text = "no charset テスト";
    stubFetch(new TextEncoder().encode(text), "text/html");

    const res = await new FetchHttpClient().get("https://example.com/");

    assert.strictEqual(await res.text(), text);
  });

  it("自動解凍されなかった gzip レスポンスを手動で解凍する（openBD 対応）", async () => {
    const json = JSON.stringify([{ summary: { title: "型システムのしくみ" } }]);
    const gz = zlib.gzipSync(Buffer.from(json, "utf-8"));
    stubFetch(new Uint8Array(gz), "application/json");

    const res = await new FetchHttpClient().get("https://api.openbd.jp/v1/get");

    assert.strictEqual(await res.text(), json);
  });

  it("gzip された非UTF-8レスポンスは解凍後に charset デコードする", async () => {
    const text = "【電子版】テスト";
    const gz = zlib.gzipSync(iconv.encode(text, "euc-jp"));
    stubFetch(new Uint8Array(gz), "text/html; charset=EUC-JP");

    const res = await new FetchHttpClient().get("https://example.com/");

    assert.strictEqual(await res.text(), text);
  });
});
