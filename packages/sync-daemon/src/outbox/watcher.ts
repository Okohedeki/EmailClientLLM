import { readFile } from "node:fs/promises";
import { join } from "node:path";
import chokidar from "chokidar";
import { outboxDir, type OutboxDraft } from "@maildeck/shared";
import { validateDraft } from "./validator.js";
import { autoPromote } from "./state-machine.js";
import { sendDraft, type SendClient } from "./sender.js";

export interface OutboxWatcherOptions {
  sendClient: SendClient;
  email: string;
  base?: string;
  reviewBeforeSend: boolean;
  onDraftDetected?: (filename: string) => void;
  onDraftSent?: (filename: string) => void;
  onError?: (filename: string, err: Error) => void;
}

/**
 * Watch the outbox directory for new/updated draft JSON files.
 * Processes them according to the state machine.
 */
export class OutboxWatcher {
  private options: OutboxWatcherOptions;
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  constructor(options: OutboxWatcherOptions) {
    this.options = options;
  }

  /** Start watching the outbox directory. */
  async start(): Promise<void> {
    const dir = outboxDir(this.options.email, this.options.base);

    this.watcher = chokidar.watch(join(dir, "*.json"), {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher.on("add", (path: string) => this.handleFile(path));
    this.watcher.on("change", (path: string) => this.handleFile(path));
  }

  /** Stop watching. */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleFile(filePath: string): Promise<void> {
    const filename = filePath.split(/[/\\]/).pop()!;
    if (!filename.endsWith(".json") || filename.endsWith(".tmp")) return;

    try {
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw);

      const validation = validateDraft(data);
      if (!validation.valid) {
        this.options.onError?.(
          filename,
          new Error(`Invalid draft: ${validation.errors.join(", ")}`)
        );
        return;
      }

      const draft = data as OutboxDraft;
      this.options.onDraftDetected?.(filename);

      // Auto-promote if review is disabled
      if (!this.options.reviewBeforeSend && draft.status === "pending_review") {
        await autoPromote(this.options.email, filename, this.options.base);
      }

      // Send if ready
      if (
        draft.status === "ready_to_send" ||
        (!this.options.reviewBeforeSend && draft.status === "pending_review")
      ) {
        await sendDraft(
          this.options.sendClient,
          this.options.email,
          filename,
          this.options.base
        );
        this.options.onDraftSent?.(filename);
      }
    } catch (err: any) {
      this.options.onError?.(filename, err);
    }
  }
}
