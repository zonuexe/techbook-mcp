import type { HttpClient, RequestOptions, HttpResponse } from "../../ports/http.js";

export interface MockResponseData {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

class MockHttpResponse implements HttpResponse {
  constructor(
    private readonly data: MockResponseData,
    private readonly requestUrl: string,
  ) {}

  get status(): number { return this.data.status; }
  get url(): string { return this.requestUrl; }
  async text(): Promise<string> { return this.data.body; }
  header(name: string): string | null {
    return this.data.headers?.[name.toLowerCase()] ?? null;
  }
}

export class MockHttpClient implements HttpClient {
  private readonly handlers = new Map<string, MockResponseData>();
  private readonly postHandlers = new Map<string, MockResponseData>();
  private readonly _calls: string[] = [];

  /** GET: URL の前方一致でレスポンスを登録する */
  addResponse(urlPrefix: string, data: MockResponseData): this {
    this.handlers.set(urlPrefix, data);
    return this;
  }

  /** POST: URL の前方一致でレスポンスを登録する */
  addPostResponse(urlPrefix: string, data: MockResponseData): this {
    this.postHandlers.set(urlPrefix, data);
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

    throw new Error(`MockHttpClient: no handler for GET: ${url}`);
  }

  async post(url: string, _body: string, _options?: RequestOptions): Promise<HttpResponse> {
    this._calls.push(url);

    if (this.postHandlers.has(url)) {
      return new MockHttpResponse(this.postHandlers.get(url)!, url);
    }

    for (const [prefix, data] of this.postHandlers) {
      if (url.startsWith(prefix)) {
        return new MockHttpResponse(data, url);
      }
    }

    throw new Error(`MockHttpClient: no handler for POST: ${url}`);
  }
}
