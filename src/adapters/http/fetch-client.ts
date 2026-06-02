import iconv from "iconv-lite";
import zlib from "node:zlib";
import type { HttpClient, RequestOptions, HttpResponse } from "../../ports/http.js";

/** Content-Type ヘッダーから charset を取り出す（小文字化）。なければ undefined */
function charsetFromContentType(contentType: string | null): string | undefined {
  const m = contentType?.match(/charset=["']?([^;"'\s]+)/i);
  return m?.[1].toLowerCase();
}

class FetchHttpResponse implements HttpResponse {
  constructor(private readonly response: Response) {}

  get status(): number {
    return this.response.status;
  }

  get url(): string {
    return this.response.url;
  }

  /**
   * レスポンスボディを文字列で返す。
   *
   * - 一部のランタイム・プロキシ環境では `Content-Encoding: gzip` が自動解凍されず
   *   gzip の生バイトが返ることがある（openBD で `JSON.parse` が壊れる等）。
   *   gzip マジックバイト (0x1f 0x8b) を検出したら手動で解凍する。
   * - `fetch().text()` は常に UTF-8 として解釈するため、Content-Type が
   *   EUC-JP・Shift_JIS など非UTF-8の場合は iconv-lite でデコードし直す
   *   （ラトルズ・ボーンデジタル等の EUC-JP サイト対応）。
   */
  async text(): Promise<string> {
    const charset = charsetFromContentType(this.response.headers.get("content-type"));
    let buffer = Buffer.from(await this.response.arrayBuffer());
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      buffer = zlib.gunzipSync(buffer);
    }
    if (charset && charset !== "utf-8" && charset !== "utf8" && iconv.encodingExists(charset)) {
      return iconv.decode(buffer, charset);
    }
    return buffer.toString("utf-8");
  }

  header(name: string): string | null {
    return this.response.headers.get(name);
  }
}

export class FetchHttpClient implements HttpClient {
  async get(url: string, options?: RequestOptions): Promise<HttpResponse> {
    const init: RequestInit = {
      headers: options?.headers,
    };
    if (options?.timeout !== undefined) {
      init.signal = AbortSignal.timeout(options.timeout);
    }
    const response = await fetch(url, init);
    return new FetchHttpResponse(response);
  }

  async post(url: string, body: string, options?: RequestOptions): Promise<HttpResponse> {
    const init: RequestInit = {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json", ...options?.headers },
    };
    if (options?.timeout !== undefined) {
      init.signal = AbortSignal.timeout(options.timeout);
    }
    const response = await fetch(url, init);
    return new FetchHttpResponse(response);
  }
}
