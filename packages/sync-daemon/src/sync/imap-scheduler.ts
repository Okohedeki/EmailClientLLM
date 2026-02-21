import { ImapClient } from "./imap-client.js";
import { imapFullSync, imapIncrementalSync } from "./imap-sync.js";
import type { ImapCredentials } from "./imap-client.js";
import { readFile } from "node:fs/promises";
import { accountMetaPath, atomicWriteJson, type AccountMeta } from "@maildeck/shared";

export interface ImapSchedulerOptions {
  creds: ImapCredentials;
  email: string;
  base?: string;
  pollIntervalMs: number;
  depthDays: number;
  maxMessages?: number;
  onSync?: (result: { type: "full" | "incremental"; threadsUpdated: number }) => void;
  onError?: (err: Error) => void;
}

/**
 * Polling-based sync scheduler for IMAP accounts.
 *
 * - First run (or no stored lastUid): full sync
 * - Subsequent runs: incremental sync via fetchSince(lastUid)
 */
export class ImapScheduler {
  private options: ImapSchedulerOptions;
  private lastUid: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private syncing = false;

  constructor(options: ImapSchedulerOptions) {
    this.options = options;
  }

  /** Start the sync loop. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Load persisted lastUid from account meta
    await this.loadLastUid();

    // Initial sync
    await this.runSync();

    // Start polling
    this.timer = setInterval(() => {
      this.runSync().catch((err) => this.options.onError?.(err));
    }, this.options.pollIntervalMs);
  }

  /** Stop the sync loop. */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async loadLastUid(): Promise<void> {
    try {
      const raw = await readFile(accountMetaPath(this.options.email, this.options.base), "utf-8");
      const meta = JSON.parse(raw) as AccountMeta;
      this.lastUid = meta.last_uid ?? null;
    } catch {
      this.lastUid = null;
    }
  }

  private async persistLastUid(): Promise<void> {
    try {
      const raw = await readFile(accountMetaPath(this.options.email, this.options.base), "utf-8");
      const meta = JSON.parse(raw) as AccountMeta;
      meta.last_uid = this.lastUid;
      meta.last_sync = new Date().toISOString();
      meta.sync_state = "idle";
      await atomicWriteJson(accountMetaPath(this.options.email, this.options.base), meta);
    } catch {
      // account.json may not exist yet on first run — will be written later
    }
  }

  private async runSync(): Promise<void> {
    if (!this.running || this.syncing) return;
    this.syncing = true;

    const client = new ImapClient(this.options.creds);

    try {
      let result: { lastUid: number; threadCount: number };
      let type: "full" | "incremental";

      if (this.lastUid && this.lastUid > 0) {
        // Incremental: only fetch messages newer than lastUid
        type = "incremental";
        result = await imapIncrementalSync(client, {
          email: this.options.email,
          base: this.options.base,
          lastUid: this.lastUid,
        });
      } else {
        // Full sync: first run or no stored UID
        type = "full";
        result = await imapFullSync(client, {
          email: this.options.email,
          base: this.options.base,
          depthDays: this.options.depthDays,
          maxMessages: this.options.maxMessages,
        });
      }

      this.lastUid = result.lastUid;
      await this.persistLastUid();

      this.options.onSync?.({
        type,
        threadsUpdated: result.threadCount,
      });
    } catch (err: any) {
      this.options.onError?.(err);
    } finally {
      this.syncing = false;
    }
  }
}
