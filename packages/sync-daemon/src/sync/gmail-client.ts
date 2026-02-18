import { google, type gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

/**
 * Gmail API wrapper with exponential backoff retry.
 */
export class GmailClient {
  private gmail: gmail_v1.Gmail;
  private email: string;

  constructor(auth: OAuth2Client, email: string) {
    this.gmail = google.gmail({ version: "v1", auth });
    this.email = email;
  }

  /** List threads with optional query. */
  async listThreads(opts: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
  } = {}): Promise<gmail_v1.Schema$ListThreadsResponse> {
    return this.withRetry(() =>
      this.gmail.users.threads.list({
        userId: "me",
        q: opts.query,
        maxResults: opts.maxResults ?? 100,
        pageToken: opts.pageToken,
      }).then((r) => r.data)
    );
  }

  /** Get a full thread with all messages. */
  async getThread(threadId: string): Promise<gmail_v1.Schema$Thread> {
    return this.withRetry(() =>
      this.gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      }).then((r) => r.data)
    );
  }

  /** Get a single message in raw format (full RFC 822). */
  async getRawMessage(messageId: string): Promise<string> {
    const res = await this.withRetry(() =>
      this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "raw",
      }).then((r) => r.data)
    );

    if (!res.raw) throw new Error(`No raw data for message ${messageId}`);
    // Gmail returns URL-safe base64
    return Buffer.from(res.raw, "base64url").toString("binary");
  }

  /** Get history changes since a given historyId. */
  async listHistory(startHistoryId: string): Promise<gmail_v1.Schema$ListHistoryResponse> {
    return this.withRetry(() =>
      this.gmail.users.history.list({
        userId: "me",
        startHistoryId: startHistoryId,
        historyTypes: ["messageAdded", "labelAdded", "labelRemoved"],
      }).then((r) => r.data)
    );
  }

  /** Send a message (RFC 822 format, base64url encoded). */
  async sendMessage(raw: string): Promise<gmail_v1.Schema$Message> {
    const encoded = Buffer.from(raw).toString("base64url");
    return this.withRetry(() =>
      this.gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encoded },
      }).then((r) => r.data)
    );
  }

  /** Get the user's profile (email, historyId). */
  async getProfile(): Promise<gmail_v1.Schema$Profile> {
    return this.withRetry(() =>
      this.gmail.users.getProfile({ userId: "me" }).then((r) => r.data)
    );
  }

  /**
   * Exponential backoff retry wrapper.
   * Retries on 429 (rate limit) and 5xx errors.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 5
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        const status = err?.response?.status ?? err?.code;

        // Only retry on rate limits and server errors
        if (status === 429 || (status >= 500 && status < 600)) {
          const delay = Math.min(1000 * 2 ** attempt, 30_000);
          await sleep(delay);
          continue;
        }

        throw err;
      }
    }

    throw lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
