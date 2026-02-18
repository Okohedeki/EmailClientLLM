import type { GmailClient } from "./gmail-client.js";
import { fullSync } from "./full-sync.js";
import { incrementalSync, HistoryExpiredError } from "./incremental-sync.js";

export interface SyncSchedulerOptions {
  client: GmailClient;
  email: string;
  base?: string;
  pollIntervalMs: number;
  depthDays: number;
  onSync?: (result: { type: "full" | "incremental"; threadsUpdated: number }) => void;
  onError?: (err: Error) => void;
}

/**
 * Polling-based sync scheduler.
 * Runs an initial full sync, then incremental syncs at the configured interval.
 */
export class SyncScheduler {
  private options: SyncSchedulerOptions;
  private historyId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(options: SyncSchedulerOptions) {
    this.options = options;
  }

  /** Start the sync loop. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Initial full sync
    await this.runFullSync();

    // Start polling
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.options.onError?.(err));
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

  /** Run a single sync tick (incremental or full if needed). */
  private async tick(): Promise<void> {
    if (!this.running) return;

    if (!this.historyId) {
      await this.runFullSync();
      return;
    }

    try {
      const result = await incrementalSync(
        this.options.client,
        this.options.email,
        this.historyId,
        this.options.base
      );
      this.historyId = result.newHistoryId;
      this.options.onSync?.({
        type: "incremental",
        threadsUpdated: result.threadsUpdated,
      });
    } catch (err) {
      if (err instanceof HistoryExpiredError) {
        // History expired — fall back to full sync
        await this.runFullSync();
      } else {
        throw err;
      }
    }
  }

  private async runFullSync(): Promise<void> {
    const historyId = await fullSync(this.options.client, {
      email: this.options.email,
      base: this.options.base,
      depthDays: this.options.depthDays,
    });
    this.historyId = historyId;
    this.options.onSync?.({ type: "full", threadsUpdated: -1 });
  }
}
