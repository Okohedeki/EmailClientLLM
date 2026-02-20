#!/usr/bin/env node
/**
 * Unified CLI entry point for ClawMail3.
 *
 * Every command returns structured JSON to stdout:
 *   { ok: true, data: ... }
 *   { ok: false, error: "..." }
 *
 * Usage:
 *   clawmail3 setup
 *   clawmail3 start
 *   clawmail3 stop
 *   clawmail3 status
 *   clawmail3 sync [--account EMAIL]
 *   clawmail3 send --to X --subject Y --body Z [--cc C] [--attach FILE]... [--no-signature]
 *   clawmail3 compose --to X --subject Y --body Z [--cc C] [--attach FILE]... [--no-signature]
 *   clawmail3 search <query>
 *   clawmail3 read <thread_id>
 *   clawmail3 threads [--limit N]
 */

import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname, resolve, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  configPath,
  accountMetaPath,
  pidFilePath,
  threadsIndexPath,
  threadDir,
  messagesDir,
  accountDir,
  outboxDir,
  signaturePath,
  atomicWriteJson,
  readJsonl,
  type AppConfig,
  type AccountMeta,
  type ThreadIndexEntry,
  type ThreadMeta,
  type OutboxDraft,
  type OutboxAttachment,
  DEFAULTS,
} from "@clawmail3/shared";

// ── JSON output helpers ─────────────────────────────────────────────

function ok(data: unknown): never {
  process.stdout.write(JSON.stringify({ ok: true, data }) + "\n");
  process.exit(0);
}

function fail(error: string): never {
  process.stdout.write(JSON.stringify({ ok: false, error }) + "\n");
  process.exit(1);
}

// ── Arg parsing ─────────────────────────────────────────────────────

/** Flags that can appear multiple times (values collected into arrays). */
const REPEATABLE_FLAGS = new Set(["attach"]);

function parseArgs(argv: string[]): { command: string; args: string[]; flags: Record<string, string>; multiFlags: Record<string, string[]> } {
  const command = argv[0] ?? "help";
  const rest = argv.slice(1);
  const flags: Record<string, string> = {};
  const multiFlags: Record<string, string[]> = {};
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) {
      const key = rest[i].slice(2);
      const val = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : "true";
      if (REPEATABLE_FLAGS.has(key)) {
        (multiFlags[key] ??= []).push(val);
      }
      flags[key] = val;
    } else {
      positional.push(rest[i]);
    }
  }

  return { command, args: positional, flags, multiFlags };
}

// ── Config helpers ──────────────────────────────────────────────────

async function loadConfig(base?: string): Promise<AppConfig> {
  try {
    const raw = await readFile(configPath(base), "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    fail("No config found. Run: clawmail3 setup");
  }
}

async function loadAccountMeta(email: string, base?: string): Promise<AccountMeta> {
  try {
    const raw = await readFile(accountMetaPath(email, base), "utf-8");
    return JSON.parse(raw) as AccountMeta;
  } catch {
    return {
      email,
      sync_state: "idle",
      last_sync: null,
      history_id: null,
      sync_depth_days: DEFAULTS.syncDepthDays,
      poll_interval_seconds: DEFAULTS.pollIntervalSeconds,
    };
  }
}

function getFirstAccount(config: AppConfig): string {
  if (config.accounts.length === 0) {
    fail("No accounts configured. Run: clawmail3 setup");
  }
  return config.accounts[0];
}

// ── PID helpers ─────────────────────────────────────────────────────

async function readPid(base?: string): Promise<number | null> {
  try {
    const raw = await readFile(pidFilePath(base), "utf-8");
    return parseInt(raw.trim(), 10);
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── MIME type detection ──────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".zip": "application/zip",
};

function detectMime(filePath: string): string {
  return MIME_MAP[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** Resolve --attach paths into OutboxAttachment[], validating each file exists. */
async function resolveAttachments(paths: string[]): Promise<OutboxAttachment[]> {
  const result: OutboxAttachment[] = [];
  for (const p of paths) {
    const abs = resolve(p);
    try {
      await access(abs);
    } catch {
      fail(`Attachment not found: ${abs}`);
    }
    result.push({
      filename: basename(abs),
      path: abs,
      mime: detectMime(abs),
    });
  }
  return result;
}

/** Read signature.txt for an account. Returns the formatted signature block or empty string. */
async function loadSignature(email: string): Promise<string> {
  try {
    const sig = await readFile(signaturePath(email), "utf-8");
    if (sig.trim()) return `\n\n-- \n${sig.trim()}`;
  } catch {
    // No signature file — that's fine
  }
  return "";
}

// ── Commands ────────────────────────────────────────────────────────

async function cmdSetup() {
  // Delegate to interactive setup (not JSON — this is the one interactive command)
  const { execFileSync } = await import("node:child_process");
  execFileSync("npx", ["tsx", join(__dirname, "setup.ts")], { stdio: "inherit" });
  process.exit(0);
}

async function cmdStart(flags: Record<string, string>) {
  const pid = await readPid();
  if (pid && isProcessRunning(pid)) {
    fail(`Daemon already running (PID ${pid})`);
  }

  // Spawn daemon as detached child
  const args = [join(__dirname, "..", "index.ts")];
  if (flags.account) {
    args.push("--account", flags.account);
  }

  const child = spawn("npx", ["tsx", ...args], {
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();

  // Wait briefly for PID file to appear
  await new Promise((r) => setTimeout(r, 1500));

  const newPid = await readPid();
  ok({ pid: newPid ?? child.pid, started: true });
}

async function cmdStop() {
  const pid = await readPid();
  if (!pid) {
    fail("No PID file found. Daemon may not be running.");
  }

  if (!isProcessRunning(pid)) {
    // Clean up stale PID file
    const { unlink } = await import("node:fs/promises");
    await unlink(pidFilePath()).catch(() => {});
    fail(`Daemon not running (stale PID ${pid}, cleaned up)`);
  }

  // Send kill signal — use taskkill on Windows, SIGTERM on Unix
  if (process.platform === "win32") {
    const { execSync } = await import("node:child_process");
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      fail(`Failed to stop daemon (PID ${pid})`);
    }
  } else {
    process.kill(pid, "SIGTERM");
  }

  // Wait for process to exit
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (!isProcessRunning(pid)) break;
  }

  // Clean up PID file in case daemon didn't
  const { unlink } = await import("node:fs/promises");
  await unlink(pidFilePath()).catch(() => {});

  ok({ stopped: true, pid });
}

async function cmdStatus() {
  const config = await loadConfig();
  const pid = await readPid();
  const running = pid !== null && isProcessRunning(pid);

  const accountStatuses = await Promise.all(
    config.accounts.map(async (email) => {
      const meta = await loadAccountMeta(email);
      return {
        email,
        sync_state: meta.sync_state,
        last_sync: meta.last_sync,
        sync_depth_days: meta.sync_depth_days,
        poll_interval_seconds: meta.poll_interval_seconds,
      };
    })
  );

  ok({
    running,
    pid: running ? pid : null,
    review_before_send: config.review_before_send,
    accounts: accountStatuses,
  });
}

async function cmdSync(flags: Record<string, string>) {
  const config = await loadConfig();
  const email = flags.account ?? getFirstAccount(config);

  const { getAppPassword } = await import("../sync/keychain.js");
  const appPassword = await getAppPassword(email);

  if (!appPassword) {
    fail(`No credentials found for ${email}. Run: clawmail3 setup`);
  }

  const { ImapClient } = await import("../sync/imap-client.js");
  const { imapFullSync } = await import("../sync/imap-sync.js");

  const client = new ImapClient({ email, appPassword });
  const depthDays = flags.days ? parseInt(flags.days, 10) : 7;
  const maxMessages = flags.max ? parseInt(flags.max, 10) : 200;

  const result = await imapFullSync(client, {
    email,
    depthDays,
    maxMessages,
  });

  // Update account metadata
  const meta = await loadAccountMeta(email);
  meta.last_sync = new Date().toISOString();
  meta.sync_state = "idle";
  await atomicWriteJson(accountMetaPath(email), meta);

  ok({
    email,
    threads_synced: result.threadCount,
    last_uid: result.lastUid,
    synced_at: meta.last_sync,
  });
}

async function cmdSend(flags: Record<string, string>, multiFlags: Record<string, string[]>) {
  if (!flags.to) fail("Missing --to flag");
  if (!flags.subject) fail("Missing --subject flag");
  if (!flags.body) fail("Missing --body flag");

  const config = await loadConfig();
  const email = flags.account ?? getFirstAccount(config);

  const { getAppPassword } = await import("../sync/keychain.js");
  const appPassword = await getAppPassword(email);

  if (!appPassword) {
    fail(`No credentials found for ${email}. Run: clawmail3 setup`);
  }

  // Resolve attachments
  const attachments = multiFlags.attach
    ? await resolveAttachments(multiFlags.attach)
    : undefined;

  // Append signature unless --no-signature
  let body = flags.body;
  if (flags["no-signature"] !== "true") {
    body += await loadSignature(email);
  }

  const { sendViaSMTP } = await import("../sync/smtp-sender.js");

  const draft: OutboxDraft = {
    action: "compose",
    to: flags.to.split(",").map((s) => s.trim()),
    cc: flags.cc ? flags.cc.split(",").map((s) => s.trim()) : undefined,
    subject: flags.subject,
    body,
    attachments,
    created_at: new Date().toISOString(),
    created_by: "clawmail3-cli",
    status: "ready_to_send",
  };

  const result = await sendViaSMTP({ email, appPassword }, draft);
  ok({ message_id: result.messageId, sent: true });
}

async function cmdCompose(flags: Record<string, string>, multiFlags: Record<string, string[]>) {
  if (!flags.to) fail("Missing --to flag");
  if (!flags.subject) fail("Missing --subject flag");
  if (!flags.body) fail("Missing --body flag");

  const config = await loadConfig();
  const email = flags.account ?? getFirstAccount(config);

  const { initAccountDirs } = await import("../storage/directory-init.js");
  await initAccountDirs(email);

  // Resolve attachments
  const attachments = multiFlags.attach
    ? await resolveAttachments(multiFlags.attach)
    : undefined;

  // Append signature unless --no-signature
  let body = flags.body;
  if (flags["no-signature"] !== "true") {
    body += await loadSignature(email);
  }

  const draftFilename = `draft-${Date.now()}.json`;
  const draft: OutboxDraft = {
    action: "compose",
    to: flags.to.split(",").map((s) => s.trim()),
    cc: flags.cc ? flags.cc.split(",").map((s) => s.trim()) : undefined,
    subject: flags.subject,
    body,
    attachments,
    created_at: new Date().toISOString(),
    created_by: "clawmail3-cli",
    status: config.review_before_send ? "pending_review" : "ready_to_send",
  };

  const draftPath = join(outboxDir(email), draftFilename);
  await atomicWriteJson(draftPath, draft);

  ok({
    filename: draftFilename,
    status: draft.status,
    path: draftPath,
  });
}

async function cmdSearch(positionalArgs: string[]) {
  const query = positionalArgs.join(" ");
  if (!query) fail("Missing search query");

  const config = await loadConfig();
  const results: Array<{
    account: string;
    thread_id: string;
    subject: string;
    from: string;
    snippet: string;
    match_line: string;
  }> = [];

  for (const email of config.accounts) {
    // Search threads.jsonl index first
    const entries = await readJsonl<ThreadIndexEntry>(threadsIndexPath(email));
    const lowerQuery = query.toLowerCase();

    for (const entry of entries) {
      const matchFields = [
        entry.subject,
        entry.from,
        entry.from_name,
        entry.snippet,
        ...(entry.participants ?? []),
      ];
      const matchLine = matchFields.find((f) => f && f.toLowerCase().includes(lowerQuery));
      if (matchLine) {
        results.push({
          account: email,
          thread_id: entry.id,
          subject: entry.subject,
          from: entry.from,
          snippet: entry.snippet,
          match_line: matchLine,
        });
      }
    }

    // Also search message .md files for body content matches
    const threadsBase = join(accountDir(email), "threads");
    let threadDirs: string[];
    try {
      threadDirs = await readdir(threadsBase);
    } catch {
      continue;
    }

    for (const tid of threadDirs) {
      // Skip if already found via index
      if (results.some((r) => r.thread_id === tid && r.account === email)) continue;

      const msgsPath = join(threadsBase, tid, "messages");
      let msgFiles: string[];
      try {
        msgFiles = await readdir(msgsPath);
      } catch {
        continue;
      }

      for (const mf of msgFiles) {
        if (!mf.endsWith(".md")) continue;
        try {
          const content = await readFile(join(msgsPath, mf), "utf-8");
          if (content.toLowerCase().includes(lowerQuery)) {
            // Extract a snippet around the match
            const idx = content.toLowerCase().indexOf(lowerQuery);
            const start = Math.max(0, idx - 40);
            const end = Math.min(content.length, idx + query.length + 40);
            const matchLine = content.slice(start, end).replace(/\n/g, " ").trim();

            // Get subject from index or thread.json
            let subject = "(unknown)";
            const indexEntry = entries.find((e) => e.id === tid);
            if (indexEntry) subject = indexEntry.subject;

            results.push({
              account: email,
              thread_id: tid,
              subject,
              from: indexEntry?.from ?? "",
              snippet: matchLine,
              match_line: matchLine,
            });
            break; // one match per thread is enough
          }
        } catch {
          continue;
        }
      }
    }
  }

  ok({ query, count: results.length, results });
}

async function cmdRead(positionalArgs: string[], flags: Record<string, string>) {
  const threadId = positionalArgs[0];
  if (!threadId) fail("Missing thread_id argument");

  const config = await loadConfig();
  const email = flags.account ?? getFirstAccount(config);

  // Read thread.json
  const tDir = threadDir(email, threadId);
  let meta: ThreadMeta;
  try {
    const raw = await readFile(join(tDir, "thread.json"), "utf-8");
    meta = JSON.parse(raw);
  } catch {
    fail(`Thread not found: ${threadId}`);
  }

  // Read all .md messages
  const msgsPath = messagesDir(email, threadId);
  let msgFiles: string[];
  try {
    msgFiles = (await readdir(msgsPath)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    msgFiles = [];
  }

  const messages: Array<{ filename: string; frontmatter: Record<string, unknown>; body: string }> = [];
  for (const mf of msgFiles) {
    const content = await readFile(join(msgsPath, mf), "utf-8");
    // Parse YAML frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (fmMatch) {
      // Simple YAML key:value parsing (avoids adding a yaml dep)
      const fmLines = fmMatch[1].split("\n");
      const frontmatter: Record<string, unknown> = {};
      for (const line of fmLines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          let val: unknown = line.slice(colonIdx + 1).trim();
          // Strip quotes
          if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1);
          }
          frontmatter[key] = val;
        }
      }
      messages.push({ filename: mf, frontmatter, body: fmMatch[2] });
    } else {
      messages.push({ filename: mf, frontmatter: {}, body: content });
    }
  }

  ok({ meta, messages });
}

async function cmdThreads(flags: Record<string, string>) {
  const config = await loadConfig();
  const email = flags.account ?? getFirstAccount(config);
  const limit = flags.limit ? parseInt(flags.limit, 10) : 20;

  const entries = await readJsonl<ThreadIndexEntry>(threadsIndexPath(email));

  // Sort by last_date descending
  entries.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());

  ok({
    account: email,
    total: entries.length,
    threads: entries.slice(0, limit),
  });
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const { command, args, flags, multiFlags } = parseArgs(process.argv.slice(2));

  try {
    switch (command) {
      case "setup":
        await cmdSetup();
        break;
      case "start":
        await cmdStart(flags);
        break;
      case "stop":
        await cmdStop();
        break;
      case "status":
        await cmdStatus();
        break;
      case "sync":
        await cmdSync(flags);
        break;
      case "send":
        await cmdSend(flags, multiFlags);
        break;
      case "compose":
        await cmdCompose(flags, multiFlags);
        break;
      case "search":
        await cmdSearch(args);
        break;
      case "read":
        await cmdRead(args, flags);
        break;
      case "threads":
        await cmdThreads(flags);
        break;
      case "help":
      default:
        ok({
          commands: [
            "setup      — Interactive account setup",
            "start      — Start daemon in background",
            "stop       — Stop running daemon",
            "status     — Show daemon & account status",
            "sync       — One-shot sync (--account, --days, --max)",
            "send       — Send email immediately (--to, --subject, --body, --cc, --attach, --no-signature)",
            "compose    — Drop draft in outbox (--to, --subject, --body, --cc, --attach, --no-signature)",
            "search     — Search messages (positional query)",
            "read       — Read a thread (positional thread_id)",
            "threads    — List recent threads (--limit N)",
          ],
        });
    }
  } catch (err: any) {
    fail(err.message ?? String(err));
  }
}

main().catch((err) => {
  fail(err.message ?? String(err));
});
