import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { crAdapter } from "../../../../src/adapters/publishers/c-r.js";
import { MockHttpClient } from "../../../../src/adapters/http/mock-client.js";
import { CheerioHtmlParser } from "../../../../src/adapters/html/cheerio-parser.js";
import { NullCacheStore } from "../../../../src/adapters/cache/null-cache.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../../fixtures");

function makeDeps(http: MockHttpClient) {
  return { http, parser: new CheerioHtmlParser(), cache: new NullCacheStore() };
}

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), "utf-8");
}

describe("crAdapter", () => {
  describe("search()", () => {
    it("検索結果から BookRecord[] を返す", async () => {
      const body = await loadFixture("c-r-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.c-r.com/book/listthum/index",
        { status: 200, body },
      );

      const results = await crAdapter.search({ title: "Kubernetes" }, makeDeps(http));

      assert.strictEqual(results.length, 2);
      assert.partialDeepStrictEqual(results[0], {
        title: "イメージで理解！Kubernetesを始める人が最初に読む本",
        authors: ["福田 敦史"],
        publisher: "C&R研究所",
        url: "https://www.c-r.com/book/detail/1623",
        isbn: "9784863545120",
        coverImageUrl: "https://www.c-r.com/book/images/m/86354-512-0_m.jpg",
      });
    });

    it("価格は税抜表記(＋税)を税込に換算する", async () => {
      const body = await loadFixture("c-r-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.c-r.com/book/listthum/index",
        { status: 200, body },
      );

      const results = await crAdapter.search({ title: "Kubernetes" }, makeDeps(http));

      // 2,720円＋税 → floor(2720 * 1.1) = 2992
      assert.strictEqual(results[0].price, 2992);
      // 3,820円＋税 → floor(3820 * 1.1) = 4202
      assert.strictEqual(results[1].price, 4202);
    });

    it("複数著者(／区切り)を分割する", async () => {
      const body = await loadFixture("c-r-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.c-r.com/book/listthum/index",
        { status: 200, body },
      );

      const results = await crAdapter.search({ title: "Kubernetes" }, makeDeps(http));

      assert.deepStrictEqual(results[1].authors, ["牧田剣吾", "松浦崇仁"]);
    });

    it("title も author も無ければ HTTP を呼ばず空配列を返す", async () => {
      const http = new MockHttpClient();
      const results = await crAdapter.search({}, makeDeps(http));
      assert.deepStrictEqual(results, []);
    });

    it("limit を適用する", async () => {
      const body = await loadFixture("c-r-search.html");
      const http = new MockHttpClient().addResponse(
        "https://www.c-r.com/book/listthum/index",
        { status: 200, body },
      );

      const results = await crAdapter.search({ title: "Kubernetes", limit: 1 }, makeDeps(http));
      assert.strictEqual(results.length, 1);
    });
  });

  describe("getDetail()", () => {
    it("詳細ページから BookRecord を返す", async () => {
      const body = await loadFixture("c-r-detail.html");
      const url = "https://www.c-r.com/book/detail/1623";
      const http = new MockHttpClient().addResponse(url, { status: 200, body });

      const result = await crAdapter.getDetail(url, makeDeps(http));

      assert.partialDeepStrictEqual(result, {
        title: "イメージで理解！Kubernetesを始める人が最初に読む本",
        authors: ["福田 敦史"],
        publisher: "C&R研究所",
        url,
        isbn: "9784863545120",
        price: 2992,
        coverImageUrl: "https://www.c-r.com/book/images/l/86354-512-0_l.jpg",
      });
      assert.ok(result.description?.startsWith("Kubernetesの複雑な概念を"));
    });

    it("ebookStores に本の森.JP(ソーシャルDRM)が含まれる", async () => {
      const body = await loadFixture("c-r-detail.html");
      const url = "https://www.c-r.com/book/detail/1623";
      const http = new MockHttpClient().addResponse(url, { status: 200, body });

      const result = await crAdapter.getDetail(url, makeDeps(http));

      assert.deepStrictEqual(result.ebookStores, [
        {
          name: "本の森.JP",
          url: "https://book.mynavi.jp/manatee/c-r/books/detail/id=151470",
          drm: "social",
        },
      ]);
    });
  });
});
