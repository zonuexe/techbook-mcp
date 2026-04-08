import type { HttpClient, RequestOptions, HttpResponse } from "../../ports/http.js";

export interface MockResponseData {
  status: number;
  body: string;
}

class MockHttpResponse implements HttpResponse {
  constructor(
    private readonly data: MockResponseData,
    private readonly requestUrl: string,
  ) {}

  get status(): number { return this.data.status; }
  get url(): string { return this.requestUrl; }
  async text(): Promise<string> { return this.data.body; }
}

export class MockHttpClient implements HttpClient {
  private readonly handlers = new Map<string, MockResponseData>();
  private readonly _calls: string[] = [];

  /** URL の前方一致でレスポンスを登録する */
  addResponse(urlPrefix: string, data: MockResponseData): this {
    this.handlers.set(urlPrefix, data);
    return this;
  }

  get calls(): readonly string[] {
    return this._calls;
  }

  async get(url: string, _options?: RequestOptions): Promise<HttpResponse> {
    this._calls.push(url);

    // 完全一致を優先
    if (this.handlers.has(url)) {
      return new MockHttpResponse(this.handlers.get(url)!, url);
    }

    // 前方一致
    for (const [prefix, data] of this.handlers) {
      if (url.startsWith(prefix)) {
        return new MockHttpResponse(data, url);
      }
    }

    throw new Error(`MockHttpClient: no handler for: ${url}`);
  }
}
