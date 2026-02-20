import type {
  ThreadIndexEntry,
  ContactEntry,
  ThreadMeta,
  MessageFrontmatter,
} from "@clawmail3/shared";
import { ImapClient, type ImapMessage } from "./imap-client.js";
import { cleanEmail } from "../cleaning/pipeline.js";
import { writeThreadMeta, writeMessage } from "../storage/thread-writer.js";
import { upsertThreadIndex, upsertContactIndex } from "../storage/index-writer.js";
import { writeAttachments } from "../storage/attachment-writer.js";
import { initAccountDirs } from "../storage/directory-init.js";

export interface ImapSyncOptions {
  email: string;
  base?: string;
  depthDays: number;
  maxMessages?: number;
  onProgress?: (synced: number, total: number) => void;
}

/**
 * Full sync via IMAP — fetch messages, clean, write to disk.
 *
 * Threading strategy: group messages by the References/In-Reply-To
 * header chain. Messages without threading headers get their own thread
 * (keyed by a hash of their Message-ID).
 */
export async function imapFullSync(
  client: ImapClient,
  opts: ImapSyncOptions
): Promise<{ lastUid: number; threadCount: number }> {
  const { email, base, depthDays, maxMessages, onProgress } = opts;

  await initAccountDirs(email, base);
  await client.connect();

  try {
    // Use [Gmail]/All Mail for broader coverage (INBOX misses archived mail)
    const messages = await client.fetchRecent(depthDays, maxMessages);
    onProgress?.(0, messages.length);

    // Group messages into threads by subject + sender heuristic
    const threads = groupIntoThreads(messages, email);

    let processed = 0;
    for (const [threadId, threadMsgs] of threads) {
      await processThread(email, threadId, threadMsgs, base);
      processed++;
      onProgress?.(processed, threads.size);
    }

    const lastUid = messages.length > 0
      ? Math.max(...messages.map((m) => m.uid))
      : 0;

    await client.disconnect();
    return { lastUid, threadCount: threads.size };
  } catch (err) {
    await client.disconnect().catch(() => {});
    throw err;
  }
}

/**
 * Group raw IMAP messages into threads.
 * Uses a simplified approach: parse each message's In-Reply-To / References
 * to build thread chains, falling back to subject-based grouping.
 */
function groupIntoThreads(
  messages: ImapMessage[],
  selfEmail: string
): Map<string, ImapMessage[]> {
  const threads = new Map<string, ImapMessage[]>();
  const msgIdToThread = new Map<string, string>();

  for (const msg of messages) {
    // Quick header extraction from raw source
    const headers = parseQuickHeaders(msg.raw);
    const msgId = headers.messageId;
    const inReplyTo = headers.inReplyTo;
    const references = headers.references;

    // Try to find existing thread via references
    let threadId: string | undefined;

    if (inReplyTo && msgIdToThread.has(inReplyTo)) {
      threadId = msgIdToThread.get(inReplyTo);
    }

    if (!threadId && references.length > 0) {
      for (const ref of references) {
        if (msgIdToThread.has(ref)) {
          threadId = msgIdToThread.get(ref);
          break;
        }
      }
    }

    // Fall back to subject-based grouping
    if (!threadId) {
      const normalizedSubject = normalizeSubject(headers.subject);
      // Use subject hash as thread ID
      threadId = hashString(normalizedSubject || msgId || `uid-${msg.uid}`);
    }

    // Register this message's ID for future reference lookups
    if (msgId) {
      msgIdToThread.set(msgId, threadId);
    }

    if (!threads.has(threadId)) {
      threads.set(threadId, []);
    }
    threads.get(threadId)!.push(msg);
  }

  return threads;
}

/**
 * Process a thread: clean all messages, write to disk, update indexes.
 */
async function processThread(
  email: string,
  threadId: string,
  messages: ImapMessage[],
  base?: string
): Promise<void> {
  const participants = new Map<string, { name: string; role: "self" | "external" }>();
  let allAttachmentMeta: { filename: string; mime: string; size_bytes: number }[] = [];
  let totalSize = 0;
  let subject = "(no subject)";
  let labels: string[] = ["INBOX"];
  let firstDate = new Date().toISOString();
  let lastDate = new Date().toISOString();
  let lastSnippet = "";
  let isUnread = false;

  for (const msg of messages) {
    const raw = msg.raw.toString("utf-8");
    const cleaned = await cleanEmail(raw, threadId, `uid${msg.uid}`);

    // Write message file
    await writeMessage(email, threadId, cleaned.frontmatter, cleaned.body, base);

    // Write attachments
    if (cleaned.attachments.length > 0) {
      const attMeta = await writeAttachments(email, threadId, cleaned.attachments, base);
      allAttachmentMeta.push(...attMeta);
    }

    // Track participants
    const fromAddr = cleaned.frontmatter.from;
    if (fromAddr) {
      const role = fromAddr === email ? "self" : "external";
      participants.set(fromAddr, { name: cleaned.frontmatter.from_name, role });
    }

    // Track metadata
    subject = cleaned.frontmatter.thread_id ? subject : (parseQuickHeaders(msg.raw).subject || subject);
    if (messages.indexOf(msg) === 0) {
      subject = parseQuickHeaders(msg.raw).subject || subject;
      firstDate = cleaned.frontmatter.date;
    }
    lastDate = cleaned.frontmatter.date;
    lastSnippet = cleaned.snippet;
    totalSize += raw.length;

    // Check unread status from IMAP flags
    if (!msg.flags.has("\\Seen")) {
      isUnread = true;
    }
  }

  const isStarred = messages.some((m) => m.flags.has("\\Flagged"));

  // Write thread.json
  const threadMeta: ThreadMeta = {
    id: threadId,
    subject,
    labels,
    unread: isUnread,
    starred: isStarred,
    participants: Array.from(participants.entries()).map(([addr, info]) => ({
      email: addr,
      name: info.name,
      role: info.role,
    })),
    message_count: messages.length,
    first_date: firstDate,
    last_date: lastDate,
    has_attachments: allAttachmentMeta.length > 0,
    attachments: allAttachmentMeta,
  };
  await writeThreadMeta(email, threadMeta, base);

  // Update thread index
  const firstParticipant = Array.from(participants.entries())[0];
  const indexEntry: ThreadIndexEntry = {
    id: threadId,
    subject,
    from: firstParticipant?.[0] ?? "",
    from_name: firstParticipant?.[1].name ?? "",
    participants: Array.from(participants.keys()),
    labels,
    unread: isUnread,
    starred: isStarred,
    msg_count: messages.length,
    last_date: lastDate,
    first_date: firstDate,
    snippet: lastSnippet,
    has_attachments: allAttachmentMeta.length > 0,
    size_bytes: totalSize,
  };
  await upsertThreadIndex(email, indexEntry, base);

  // Update contact index for external senders
  for (const [addr, info] of participants) {
    if (info.role === "external") {
      await upsertContactIndex(email, {
        email: addr,
        name: info.name,
        first_seen: firstDate.split("T")[0],
        last_seen: lastDate.split("T")[0],
        msg_count: 1,
        labels_common: labels,
        is_frequent: false,
      }, base);
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

interface QuickHeaders {
  messageId: string;
  inReplyTo: string;
  references: string[];
  subject: string;
}

/** Fast header extraction without full MIME parse. */
function parseQuickHeaders(raw: Buffer): QuickHeaders {
  // Only look at the first 8KB for headers
  const headerBlock = raw.subarray(0, 8192).toString("utf-8");
  const endOfHeaders = headerBlock.indexOf("\r\n\r\n");
  const headers = endOfHeaders > 0 ? headerBlock.substring(0, endOfHeaders) : headerBlock;

  return {
    messageId: extractHeader(headers, "message-id"),
    inReplyTo: extractHeader(headers, "in-reply-to"),
    references: extractHeader(headers, "references")
      .split(/\s+/)
      .filter((r) => r.startsWith("<")),
    subject: extractHeader(headers, "subject"),
  };
}

function extractHeader(headers: string, name: string): string {
  const regex = new RegExp(`^${name}:\\s*(.+?)$`, "im");
  const match = headers.match(regex);
  return match ? match[1].trim() : "";
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd):\s*/gi, "")
    .replace(/^(re|fw|fwd):\s*/gi, "") // double strip for "Re: Re:"
    .trim()
    .toLowerCase();
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
}
