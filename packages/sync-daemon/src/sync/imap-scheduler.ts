import { ImapClient } from "./imap-client.js";
import { imapFullSync } from "./imap-sync.js";
import type { ImapCredentials } from "./imap-client.js";

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
 * - First run: full sync (depthDays, up to maxMessages)
 * - Subsequent runs: recent only (last 2 days, up to 100 messages)
 */
export class ImapScheduler {
  private options: ImapSchedulerOptions;
  private firstSyncDone = false;
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

    // Initial full sync
    await this.runSync();
    this.firstSyncDone = true;

    // Start polling (subsequent syncs are lighter)
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

  private async runSync(): Promise<void> {
    if (!this.running || this.syncing) return;
    this.syncing = true;

    const client = new ImapClient(this.options.creds);

    try {
      // First sync: use full depth + maxMessages
      // Subsequent syncs: just last 2 days, up to 100 messages
      const depthDays = this.firstSyncDone ? 2 : this.options.depthDays;
      const maxMessages = this.firstSyncDone ? 100 : this.options.maxMessages;

      const result = await imapFullSync(client, {
        email: this.options.email,
        base: this.options.base,
        depthDays,
        maxMessages,
      });

      this.options.onSync?.({
        type: this.firstSyncDone ? "incremental" : "full",
        threadsUpdated: result.threadCount,
      });
    } catch (err: any) {
      this.options.onError?.(err);
    } finally {
      this.syncing = false;
    }
  }
}
