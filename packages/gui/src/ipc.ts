/**
 * IPC layer using Neutralinojs filesystem API.
 *
 * Reads directly from ~/.maildeck/ — the same files agents read.
 * No backend server needed. All parsing happens in the browser.
 */

// Types inlined to avoid importing Node.js-dependent @maildeck/shared in the browser

export interface ThreadIndexEntry {
  id: string;
  subject: string;
  from: string;
  from_name: string;
  participants: string[];
  labels: string[];
  unread: boolean;
  starred: boolean;
  msg_count: number;
  last_date: string;
  first_date: string;
  snippet: string;
  has_attachments: boolean;
  size_bytes: number;
}

export interface ThreadMeta {
  id: string;
  subject: string;
  labels: string[];
  unread: boolean;
  starred: boolean;
  participants: { email: string; name: string; role: string }[];
  message_count: number;
  first_date: string;
  last_date: string;
  has_attachments: boolean;
  attachments: { filename: string; mime: string; size_bytes: number }[];
}

export interface ContactEntry {
  email: string;
  name: string;
  first_seen: string;
  last_seen: string;
  msg_count: number;
  labels_common: string[];
  is_frequent: boolean;
}

export interface OutboxDraft {
  action: string;
  thread_id?: string;
  in_reply_to?: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  created_at?: string;
  created_by?: string;
  status: string;
}

export interface AppConfig {
  review_before_send: boolean;
  accounts: string[];
}

export interface AccountMeta {
  email: string;
  sync_state: string;
  last_sync: string | null;
  history_id: string | null;
  sync_depth_days: number;
  poll_interval_seconds: number;
}

// ── Path helpers ────────────────────────────────────────────────────

async function getHomeDir(): Promise<string> {
  // Neutralino provides the home directory via os.getEnv
  const home = await Neutralino.os.getEnv("USERPROFILE") ||
               await Neutralino.os.getEnv("HOME");
  return home;
}

async function baseDir(): Promise<string> {
  const home = await getHomeDir();
  return `${home}/.maildeck`;
}

async function accountPath(email: string): Promise<string> {
  return `${await baseDir()}/accounts/${email}`;
}

// ── File readers ────────────────────────────────────────────────────

async function readTextFile(path: string): Promise<string> {
  return Neutralino.filesystem.readFile(path);
}

function parseJsonl<T>(content: string): T[] {
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

async function readJsonFile<T>(path: string): Promise<T> {
  const content = await readTextFile(path);
  return JSON.parse(content) as T;
}

// ── Public API ──────────────────────────────────────────────────────

export async function readThreadsIndex(email: string): Promise<ThreadIndexEntry[]> {
  try {
    const path = `${await accountPath(email)}/index/threads.jsonl`;
    const content = await readTextFile(path);
    return parseJsonl<ThreadIndexEntry>(content);
  } catch {
    return [];
  }
}

export async function readThreadMeta(email: string, threadId: string): Promise<ThreadMeta> {
  const path = `${await accountPath(email)}/threads/${threadId}/thread.json`;
  return readJsonFile<ThreadMeta>(path);
}

export async function readMessages(
  email: string,
  threadId: string
): Promise<{ filename: string; content: string }[]> {
  const dir = `${await accountPath(email)}/threads/${threadId}/messages`;
  try {
    const entries = await Neutralino.filesystem.readDirectory(dir);
    const mdFiles = entries
      .filter((e) => e.type === "FILE" && e.entry.endsWith(".md"))
      .map((e) => e.entry)
      .sort();

    const results: { filename: string; content: string }[] = [];
    for (const filename of mdFiles) {
      const content = await readTextFile(`${dir}/${filename}`);
      results.push({ filename, content });
    }
    return results;
  } catch {
    return [];
  }
}

export async function readContactsIndex(email: string): Promise<ContactEntry[]> {
  try {
    const path = `${await accountPath(email)}/index/contacts.jsonl`;
    const content = await readTextFile(path);
    return parseJsonl<ContactEntry>(content);
  } catch {
    return [];
  }
}

export async function readOutboxDrafts(
  email: string
): Promise<{ filename: string; draft: OutboxDraft }[]> {
  const dir = `${await accountPath(email)}/outbox`;
  try {
    const entries = await Neutralino.filesystem.readDirectory(dir);
    const jsonFiles = entries.filter(
      (e) => e.type === "FILE" && e.entry.endsWith(".json")
    );

    const results: { filename: string; draft: OutboxDraft }[] = [];
    for (const entry of jsonFiles) {
      const content = await readTextFile(`${dir}/${entry.entry}`);
      const draft = JSON.parse(content) as OutboxDraft;
      results.push({ filename: entry.entry, draft });
    }
    return results;
  } catch {
    return [];
  }
}

export async function approveDraft(email: string, filename: string): Promise<void> {
  const path = `${await accountPath(email)}/outbox/${filename}`;
  const content = await readTextFile(path);
  const draft = JSON.parse(content);

  if (draft.status !== "pending_review") {
    throw new Error("Draft is not in pending_review status");
  }

  draft.status = "ready_to_send";
  await Neutralino.filesystem.writeFile(path, JSON.stringify(draft, null, 2));
}

export async function readConfig(): Promise<AppConfig> {
  try {
    const path = `${await baseDir()}/config.json`;
    return await readJsonFile<AppConfig>(path);
  } catch {
    return { review_before_send: true, accounts: [] };
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  const path = `${await baseDir()}/config.json`;
  await Neutralino.filesystem.writeFile(
    path,
    JSON.stringify(config, null, 2)
  );
}

export async function readAccountMeta(email: string): Promise<AccountMeta> {
  try {
    const path = `${await accountPath(email)}/account.json`;
    return await readJsonFile<AccountMeta>(path);
  } catch {
    return {
      email,
      sync_state: "idle",
      last_sync: null,
      history_id: null,
      sync_depth_days: 30,
      poll_interval_seconds: 60,
    };
  }
}

// OAuth is handled by the sync-daemon CLI, not the GUI
export async function startOAuthFlow(): Promise<string> {
  throw new Error("Run 'npm run setup --workspace=packages/sync-daemon' in the terminal to connect Gmail.");
}

export async function completeOAuthFlow(_code: string, _email: string): Promise<void> {
  throw new Error("Run 'npm run setup --workspace=packages/sync-daemon' in the terminal to connect Gmail.");
}
