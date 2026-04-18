import { createInterface } from "node:readline/promises";
import {
  loadCredentials,
  saveCredentials,
  getCredentialsPath,
  type Credentials,
} from "./config/credentials.js";

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  // プロンプトを stderr に出してMCPのstdoutを汚染しない
  process.stderr.write(question);
  const answer = await rl.question("");
  return answer.trim();
}

export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdin });

  try {
    process.stderr.write("techbook-mcp セットアップ\n");
    process.stderr.write("=".repeat(40) + "\n\n");

    const current = await loadCredentials();
    const updated: Credentials = { ...current };

    // Google Books API キー
    const envKey = process.env["GOOGLE_BOOKS_API_KEY"];
    const savedKey = current.googleBooksApiKey ?? "";
    const effectiveKey = envKey ?? savedKey;
    const hint = effectiveKey
      ? ` [現在: ${maskKey(effectiveKey)}]`
      : " [未設定]";

    const input = await prompt(rl, `Google Books API キー${hint} (Enterでスキップ): `);

    if (input) {
      updated.googleBooksApiKey = input;
    } else if (!savedKey && envKey) {
      // 環境変数のみで設定済みの場合は設定ファイルには書かない
      process.stderr.write("\n環境変数 GOOGLE_BOOKS_API_KEY が設定されています。設定ファイルへの保存をスキップします。\n");
    }

    await saveCredentials(updated);
    process.stderr.write(`\n設定を保存しました: ${getCredentialsPath()}\n`);
  } finally {
    rl.close();
  }
}
