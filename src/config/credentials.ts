import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Credentials {
  googleBooksApiKey?: string;
}

export function getConfigDir(): string {
  const { platform, env } = process;
  if (platform === "win32") {
    return join(env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"), "techbook-mcp");
  }
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "techbook-mcp");
  }
  // Linux / others: XDG Base Directory
  return join(env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"), "techbook-mcp");
}

export function getCredentialsPath(): string {
  return join(getConfigDir(), "credentials.json");
}

export async function loadCredentials(): Promise<Credentials> {
  try {
    const text = await readFile(getCredentialsPath(), "utf-8");
    return JSON.parse(text) as Credentials;
  } catch {
    return {};
  }
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  const configDir = getConfigDir();
  await mkdir(configDir, { recursive: true });
  await writeFile(getCredentialsPath(), JSON.stringify(creds, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
}
