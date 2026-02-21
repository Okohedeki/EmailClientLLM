import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface ImapCredentials {
  email: string;
  appPassword: string;
  host?: string;
  port?: number;
}

export interface ImapMessage {
  uid: number;
  raw: Buffer;
  flags: Set<string>;
  threadId?: string;
  gmailMsgId?: string;
}

/**
 * IMAP client wrapper for Gmail (and other providers).
 * Uses App Password auth — no OAuth needed.
 */
export class ImapClient {
  private creds: ImapCredentials;
  private client: ImapFlow | null = null;

  constructor(creds: ImapCredentials) {
    this.creds = creds;
  }

  /** Connect and authenticate. */
  async connect(): Promise<void> {
    this.client = new ImapFlow({
      host: this.creds.host ?? "imap.gmail.com",
      port: this.creds.port ?? 993,
      secure: true,
      auth: {
        user: this.creds.email,
        pass: this.creds.appPassword,
      },
      logger: false,
    });

    await this.client.connect();
  }

  /** Disconnect gracefully. */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
    }
  }

  /** Fetch messages from the last N days. Returns raw RFC822 messages. */
  async fetchRecent(days: number, maxMessages?: number): Promise<ImapMessage[]> {
    if (!this.client) throw new Error("Not connected");

    const lock = await this.client.getMailboxLock("[Gmail]/All Mail");
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const messages: ImapMessage[] = [];

      // Search for messages since the date (uid: true → return UIDs not sequence numbers)
      const uids = await this.client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return [];

      // Limit if requested
      const targetUids = maxMessages ? uids.slice(-maxMessages) : uids;

      // Third arg { uid: true } tells fetch to interpret the range as UIDs
      for await (const msg of this.client.fetch(targetUids, {
        source: true,
        flags: true,
        envelope: true,
      }, { uid: true })) {
        messages.push({
          uid: msg.uid,
          raw: msg.source!,
          flags: msg.flags ?? new Set(),
          threadId: undefined,
          gmailMsgId: undefined,
        });
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  /** Fetch messages from INBOX only. */
  async fetchInbox(days: number, maxMessages?: number): Promise<ImapMessage[]> {
    if (!this.client) throw new Error("Not connected");

    const lock = await this.client.getMailboxLock("INBOX");
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const messages: ImapMessage[] = [];
      const uids = await this.client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return [];

      const targetUids = maxMessages ? uids.slice(-maxMessages) : uids;

      for await (const msg of this.client.fetch(targetUids, {
        source: true,
        flags: true,
      }, { uid: true })) {
        messages.push({
          uid: msg.uid,
          raw: msg.source!,
          flags: msg.flags ?? new Set(),
        });
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  /**
   * Fetch new messages since a given UID.
   * Used for incremental sync.
   */
  async fetchSince(lastUid: number): Promise<ImapMessage[]> {
    if (!this.client) throw new Error("Not connected");

    const lock = await this.client.getMailboxLock("[Gmail]/All Mail");
    try {
      const messages: ImapMessage[] = [];
      const range = `${lastUid + 1}:*`;

      for await (const msg of this.client.fetch(range, {
        source: true,
        flags: true,
      }, { uid: true })) {
        if (msg.uid > lastUid) {
          messages.push({
            uid: msg.uid,
            raw: msg.source!,
            flags: msg.flags ?? new Set(),
          });
        }
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  /** Fetch all unread (UNSEEN) messages from [Gmail]/All Mail. No date range or cap. */
  async fetchUnread(): Promise<ImapMessage[]> {
    if (!this.client) throw new Error("Not connected");

    const lock = await this.client.getMailboxLock("[Gmail]/All Mail");
    try {
      const messages: ImapMessage[] = [];

      const uids = await this.client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return [];

      for await (const msg of this.client.fetch(uids, {
        source: true,
        flags: true,
      }, { uid: true })) {
        messages.push({
          uid: msg.uid,
          raw: msg.source!,
          flags: msg.flags ?? new Set(),
        });
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  /** Mark the given UIDs as read (\Seen) on the IMAP server. */
  async markRead(uids: number[]): Promise<void> {
    if (!this.client) throw new Error("Not connected");
    if (uids.length === 0) return;

    const lock = await this.client.getMailboxLock("[Gmail]/All Mail");
    try {
      await this.client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  }

  /** List all available mailboxes. Useful for debugging folder names. */
  async listMailboxes(): Promise<string[]> {
    if (!this.client) throw new Error("Not connected");
    const mailboxes: string[] = [];
    const tree = await this.client.list();
    for (const box of tree) {
      mailboxes.push(box.path);
    }
    return mailboxes;
  }

  /** Test the connection (connect + disconnect). */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.disconnect();
      return true;
    } catch {
      return false;
    }
  }
}
