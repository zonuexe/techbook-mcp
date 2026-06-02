/** withTimeout が時間切れで投げる専用エラー */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`タイムアウト (${ms}ms)`);
    this.name = "TimeoutError";
  }
}

/**
 * promise が ms 以内に解決しなければ TimeoutError で reject する。
 * 元の fetch 自体はキャンセルされない（解決すればキャッシュに載るので無駄にならない）。
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * items を最大 limit 並列で fn に通し、入力順に揃えた結果を返す。
 * 各要素は fulfilled / rejected に振り分けられ、1件の失敗が全体を止めない。
 * （JS は単一スレッドなのでインデックス採番に競合はない）
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
