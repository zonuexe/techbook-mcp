import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTimeout, TimeoutError, mapWithConcurrency } from "../../../src/application/concurrency.js";

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe("withTimeout()", () => {
  it("期限内に解決すれば値を返す", async () => {
    const result = await withTimeout(Promise.resolve(42), 100);
    assert.strictEqual(result, 42);
  });

  it("期限を超えると TimeoutError を投げる", async () => {
    await assert.rejects(
      withTimeout(delay(50).then(() => "late"), 10),
      (e: unknown) => e instanceof TimeoutError,
    );
  });
});

describe("mapWithConcurrency()", () => {
  it("入力順に揃った結果を返す", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => n * 10);
    assert.deepStrictEqual(
      results.map(r => (r.status === "fulfilled" ? r.value : null)),
      [10, 20, 30],
    );
  });

  it("一部が失敗しても他は fulfilled で返る", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    assert.strictEqual(results[0].status, "fulfilled");
    assert.strictEqual(results[1].status, "rejected");
    assert.strictEqual(results[2].status, "fulfilled");
  });

  it("同時実行数が limit を超えない", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active++;
      peak = Math.max(peak, active);
      await delay(10);
      active--;
    });
    assert.ok(peak <= 2, `peak=${peak}`);
  });
});
