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
 * Runs periodic full syncs (IMAP doesn't have Gmail's history API).
 */
export class ImapScheduler {
  private options: ImapSchedulerOptions;
  private lastUid = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(options: ImapSchedulerOptions) {
    this.options = options;
  }

  /** Start the sync loop. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

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

  private async runSync(): Promise<void> {
    if (!this.running) return;

    const client = new ImapClient(this.options.creds);

    try {
      const result = await imapFullSync(client, {
        email: this.options.email,
        base: this.options.base,
        depthDays: this.options.depthDays,
        maxMessages: this.options.maxMessages,
      });

      this.lastUid = result.lastUid;
      this.options.onSync?.({
        type: "full",
        threadsUpdated: result.threadCount,
      });
    } catch (err: any) {
      this.options.onError?.(err);
    }
  }
}
