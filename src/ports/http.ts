export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly url: string;
  text(): Promise<string>;
}

export interface HttpClient {
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
}
