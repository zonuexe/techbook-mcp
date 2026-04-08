import type { CacheStore } from "../../ports/cache.js";

/** テスト・デバッグ用。キャッシュを一切行わない。 */
export class NullCacheStore implements CacheStore {
  async get(_key: string): Promise<null> { return null; }
  async set(_key: string, _value: string, _ttlSeconds?: number): Promise<void> {}
  async delete(_key: string): Promise<void> {}
}
