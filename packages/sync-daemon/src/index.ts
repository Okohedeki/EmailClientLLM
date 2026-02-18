import { readFile } from "node:fs/promises";
import {
  configPath,
  accountMetaPath,
  atomicWriteJson,
  type AppConfig,
  type AccountMeta,
  DEFAULTS,
} from "@maildeck/shared";
import { initAccountDirs } from "./storage/directory-init.js";
import { getAppPassword } from "./sync/keychain.js";
import { ImapScheduler } from "./sync/imap-scheduler.js";
import { OutboxWatcher } from "./outbox/watcher.js";
import type { SendClient } from "./outbox/sender.js";
import { initLogger, log } from "./logger.js";

interface DaemonOptions {
  base?: string;
  account?: string;
  fullSync?: boolean;
  once?: boolean;
}

/**
 * Parse CLI arguments.
 */
function parseArgs(): DaemonOptions {
  const args = process.argv.slice(2);
  const opts: DaemonOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--base":
        opts.base = args[++i];
        break;
      case "--account":
        opts.account = args[++i];
        break;
      case "--full-sync":
        opts.fullSync = true;
        break;
      case "--once":
        opts.once = true;
        break;
    }
  }

  return opts;
}

/**
 * Load the app config, or create a default one.
 */
async function loadConfig(base?: string): Promise<AppConfig> {
  const path = configPath(base);
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    const defaultConfig: AppConfig = {
      review_before_send: DEFAULTS.reviewBeforeSend,
      accounts: [],
    };
    await atomicWriteJson(path, defaultConfig);
    return defaultConfig;
  }
}

/**
 * Load account metadata, or create default.
 */
async function loadAccountMeta(
  email: string,
  base?: string
): Promise<AccountMeta> {
  const path = accountMetaPath(email, base);
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as AccountMeta;
  } catch {
    const meta: AccountMeta = {
      email,
      sync_state: "idle",
      last_sync: null,
      history_id: null,
      sync_depth_days: DEFAULTS.syncDepthDays,
      poll_interval_seconds: DEFAULTS.pollIntervalSeconds,
    };
    await atomicWriteJson(path, meta);
    return meta;
  }
}

async function main() {
  const opts = parseArgs();

  await initLogger(opts.base);
  await log("info", "MailDeck sync daemon starting...");

  const config = await loadConfig(opts.base);

  // Determine which accounts to sync
  const accounts = opts.account ? [opts.account] : config.accounts;

  if (accounts.length === 0) {
    await log("warn", "No accounts configured. Run: npm run setup --workspace=packages/sync-daemon");
    process.exit(0);
  }

  const schedulers: ImapScheduler[] = [];
  const oauthSchedulers: any[] = [];
  const watchers: OutboxWatcher[] = [];

  for (const email of accounts) {
    await log("info", `Setting up account: ${email}`);
    await initAccountDirs(email, opts.base);

    const accountMeta = await loadAccountMeta(email, opts.base);

    // Try IMAP first (App Password), fall back to OAuth
    const appPassword = await getAppPassword(email);

    if (appPassword) {
      // IMAP path
      await log("info", `[${email}] Using IMAP + App Password`);

      const creds = { email, appPassword };

      const scheduler = new ImapScheduler({
        creds,
        email,
        base: opts.base,
        pollIntervalMs: accountMeta.poll_interval_seconds * 1000,
        depthDays: accountMeta.sync_depth_days,
        onSync: async (result) => {
          await log("info", `[${email}] ${result.type} sync complete (${result.threadsUpdated} threads)`);
          const meta = await loadAccountMeta(email, opts.base);
          meta.last_sync = new Date().toISOString();
          meta.sync_state = "idle";
          await atomicWriteJson(accountMetaPath(email, opts.base), meta);
        },
        onError: async (err) => {
          await log("error", `[${email}] Sync error: ${err.message}`);
        },
      });

      schedulers.push(scheduler);

      // Outbox watcher with SMTP sending
      const sendClient: SendClient = {
        type: "smtp",
        creds: { email, appPassword },
      };

      const watcher = new OutboxWatcher({
        sendClient,
        email,
        base: opts.base,
        reviewBeforeSend: config.review_before_send,
        onDraftDetected: async (filename) => {
          await log("info", `[${email}] Draft detected: ${filename}`);
        },
        onDraftSent: async (filename) => {
          await log("info", `[${email}] Draft sent: ${filename}`);
        },
        onError: async (filename, err) => {
          await log("error", `[${email}] Draft error (${filename}): ${err.message}`);
        },
      });

      watchers.push(watcher);
    } else {
      // OAuth path
      try {
        const { getAuthenticatedClient } = await import("./sync/oauth.js");
        const { GmailClient } = await import("./sync/gmail-client.js");
        const { SyncScheduler } = await import("./sync/sync-scheduler.js");

        await log("info", `[${email}] Using Gmail OAuth`);

        const auth = await getAuthenticatedClient(email);
        const client = new GmailClient(auth, email);

        const scheduler = new SyncScheduler({
          client,
          email,
          base: opts.base,
          pollIntervalMs: accountMeta.poll_interval_seconds * 1000,
          depthDays: accountMeta.sync_depth_days,
          onSync: async (result) => {
            await log("info", `[${email}] ${result.type} sync complete (${result.threadsUpdated} threads)`);
            const meta = await loadAccountMeta(email, opts.base);
            meta.last_sync = new Date().toISOString();
            meta.sync_state = "idle";
            await atomicWriteJson(accountMetaPath(email, opts.base), meta);
          },
          onError: async (err) => {
            await log("error", `[${email}] Sync error: ${err.message}`);
          },
        });

        oauthSchedulers.push(scheduler);

        const sendClient: SendClient = { type: "oauth", client };

        const watcher = new OutboxWatcher({
          sendClient,
          email,
          base: opts.base,
          reviewBeforeSend: config.review_before_send,
          onDraftDetected: async (filename) => {
            await log("info", `[${email}] Draft detected: ${filename}`);
          },
          onDraftSent: async (filename) => {
            await log("info", `[${email}] Draft sent: ${filename}`);
          },
          onError: async (filename, err) => {
            await log("error", `[${email}] Draft error (${filename}): ${err.message}`);
          },
        });

        watchers.push(watcher);
      } catch (err: any) {
        await log("error", `[${email}] Auth failed: ${err.message}. Run setup first.`);
        continue;
      }
    }
  }

  // Start everything
  for (const scheduler of schedulers) {
    await scheduler.start();
  }
  for (const scheduler of oauthSchedulers) {
    await scheduler.start();
  }
  for (const watcher of watchers) {
    await watcher.start();
  }

  await log("info", `Daemon running for ${accounts.length} account(s)`);

  if (opts.once) {
    await log("info", "Single sync complete (--once). Shutting down.");
    for (const s of schedulers) s.stop();
    for (const s of oauthSchedulers) s.stop();
    for (const w of watchers) await w.stop();
    process.exit(0);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    await log("info", `Received ${signal}. Shutting down gracefully...`);
    for (const s of schedulers) s.stop();
    for (const s of oauthSchedulers) s.stop();
    for (const w of watchers) await w.stop();
    await log("info", "Daemon stopped.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch(async (err) => {
  await log("error", `Fatal: ${err.message}`);
  process.exit(1);
});
