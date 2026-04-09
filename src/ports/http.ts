export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly url: string;
  text(): Promise<string>;
  /** ヘッダー値を取得する。複数値は `, ` 結合。存在しない場合は null。 */
  header(name: string): string | null;
}

export interface HttpClient {
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
  post(url: string, body: string, options?: RequestOptions): Promise<HttpResponse>;
}
