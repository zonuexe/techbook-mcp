import iconv from "iconv-lite";
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
   * `fetch().text()` は常に UTF-8 として解釈するため、Content-Type が
   * EUC-JP・Shift_JIS など非UTF-8の場合は iconv-lite でデコードし直す
   * （ラトルズ・ボーンデジタル等の EUC-JP サイト対応）。
   */
  async text(): Promise<string> {
    const charset = charsetFromContentType(this.response.headers.get("content-type"));
    if (charset && charset !== "utf-8" && charset !== "utf8" && iconv.encodingExists(charset)) {
      const buffer = Buffer.from(await this.response.arrayBuffer());
      return iconv.decode(buffer, charset);
    }
    return this.response.text();
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
