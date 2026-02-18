import type { GmailClient } from "./gmail-client.js";
import type { ThreadIndexEntry, ContactEntry, ThreadMeta, AttachmentMeta } from "@maildeck/shared";
import { cleanEmail } from "../cleaning/pipeline.js";
import { writeThreadMeta, writeMessage } from "../storage/thread-writer.js";
import { upsertThreadIndex, upsertContactIndex } from "../storage/index-writer.js";
import { writeAttachments } from "../storage/attachment-writer.js";
import { initAccountDirs } from "../storage/directory-init.js";

export interface FullSyncOptions {
  email: string;
  base?: string;
  depthDays: number;
  maxThreads?: number;
  onProgress?: (synced: number, total: number) => void;
}

/**
 * Perform a full initial sync of the inbox.
 * Fetches threads, processes each message, and writes to disk.
 * Returns the historyId for future incremental syncs.
 */
export async function fullSync(
  client: GmailClient,
  opts: FullSyncOptions
): Promise<string> {
  const { email, base, depthDays, maxThreads, onProgress } = opts;

  // Ensure directory structure exists
  await initAccountDirs(email, base);

  // Get current profile for historyId
  const profile = await client.getProfile();
  const historyId = profile.historyId ?? "0";

  // Build date query
  const after = new Date();
  after.setDate(after.getDate() - depthDays);
  const afterStr = `${after.getFullYear()}/${after.getMonth() + 1}/${after.getDate()}`;
  const query = `after:${afterStr}`;

  // Collect all thread IDs
  const threadIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await client.listThreads({
      query,
      maxResults: 100,
      pageToken,
    });

    if (res.threads) {
      for (const t of res.threads) {
        if (t.id) threadIds.push(t.id);
      }
    }

    pageToken = res.nextPageToken ?? undefined;

    if (maxThreads && threadIds.length >= maxThreads) {
      threadIds.length = maxThreads;
      break;
    }
  } while (pageToken);

  // Process each thread
  for (let i = 0; i < threadIds.length; i++) {
    await syncThread(client, email, threadIds[i], base);
    onProgress?.(i + 1, threadIds.length);
  }

  return historyId;
}

/**
 * Sync a single thread: fetch all messages, clean, write to disk.
 */
export async function syncThread(
  client: GmailClient,
  email: string,
  threadId: string,
  base?: string
): Promise<void> {
  const thread = await client.getThread(threadId);
  if (!thread.messages || thread.messages.length === 0) return;

  const participants = new Map<string, { name: string; role: "self" | "external" }>();
  let allAttachments: AttachmentMeta[] = [];
  let totalSize = 0;

  // Get the thread subject from first message
  const firstMsg = thread.messages[0];
  const subject = getHeader(firstMsg, "Subject") ?? "(no subject)";
  const labels = firstMsg.labelIds ?? [];

  for (const msg of thread.messages) {
    if (!msg.id) continue;

    // Fetch raw message for cleaning pipeline
    const raw = await client.getRawMessage(msg.id);
    const cleaned = await cleanEmail(raw, threadId, msg.id);

    // Write message file
    await writeMessage(email, threadId, cleaned.frontmatter, cleaned.body, base);

    // Write attachments
    if (cleaned.attachments.length > 0) {
      const attMeta = await writeAttachments(
        email,
        threadId,
        cleaned.attachments,
        base
      );
      allAttachments.push(
        ...attMeta.map((a) => ({
          filename: a.filename,
          mime: a.mime,
          size_bytes: a.size_bytes,
        }))
      );
    }

    // Track participants
    if (cleaned.frontmatter.from) {
      const role = cleaned.frontmatter.from === email ? "self" : "external";
      participants.set(cleaned.frontmatter.from, {
        name: cleaned.frontmatter.from_name,
        role,
      });
    }

    totalSize += raw.length;

    // Update contact index for external senders
    if (cleaned.frontmatter.from && cleaned.frontmatter.from !== email) {
      await upsertContactIndex(
        email,
        {
          email: cleaned.frontmatter.from,
          name: cleaned.frontmatter.from_name,
          first_seen: cleaned.frontmatter.date.split("T")[0],
          last_seen: cleaned.frontmatter.date.split("T")[0],
          msg_count: 1,
          labels_common: labels,
          is_frequent: false,
        },
        base
      );
    }
  }

  const firstDate = getHeader(firstMsg, "Date") ?? new Date().toISOString();
  const lastMsg = thread.messages[thread.messages.length - 1];
  const lastDate = getHeader(lastMsg, "Date") ?? new Date().toISOString();
  const isUnread = labels.includes("UNREAD");

  // Write thread.json
  const threadMeta: ThreadMeta = {
    id: threadId,
    subject,
    labels,
    unread: isUnread,
    starred: labels.includes("STARRED"),
    participants: Array.from(participants.entries()).map(([addr, info]) => ({
      email: addr,
      name: info.name,
      role: info.role,
    })),
    message_count: thread.messages.length,
    first_date: tryParseDate(firstDate),
    last_date: tryParseDate(lastDate),
    has_attachments: allAttachments.length > 0,
    attachments: allAttachments,
  };
  await writeThreadMeta(email, threadMeta, base);

  // Get snippet from last message for index
  const lastRaw = await client.getRawMessage(lastMsg.id!);
  const lastCleaned = await cleanEmail(lastRaw, threadId, lastMsg.id!);

  // Update thread index
  const indexEntry: ThreadIndexEntry = {
    id: threadId,
    subject,
    from: threadMeta.participants[0]?.email ?? "",
    from_name: threadMeta.participants[0]?.name ?? "",
    participants: Array.from(participants.keys()),
    labels,
    unread: isUnread,
    starred: labels.includes("STARRED"),
    msg_count: thread.messages.length,
    last_date: threadMeta.last_date,
    first_date: threadMeta.first_date,
    snippet: lastCleaned.snippet,
    has_attachments: allAttachments.length > 0,
    size_bytes: totalSize,
  };
  await upsertThreadIndex(email, indexEntry, base);
}

function getHeader(
  msg: { payload?: { headers?: { name?: string | null; value?: string | null }[] | null } | null },
  name: string
): string | undefined {
  return msg.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  )?.value ?? undefined;
}

function tryParseDate(dateStr: string): string {
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
