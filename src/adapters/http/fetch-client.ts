import type { HttpClient, RequestOptions, HttpResponse } from "../../ports/http.js";

class FetchHttpResponse implements HttpResponse {
  constructor(private readonly response: Response) {}

  get status(): number {
    return this.response.status;
  }

  get url(): string {
    return this.response.url;
  }

  text(): Promise<string> {
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
