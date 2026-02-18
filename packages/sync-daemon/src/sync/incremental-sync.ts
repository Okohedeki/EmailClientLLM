import type { GmailClient } from "./gmail-client.js";
import { syncThread } from "./full-sync.js";

export interface IncrementalSyncResult {
  newHistoryId: string;
  threadsUpdated: number;
}

/**
 * Incremental sync using Gmail's history.list API.
 * Only processes threads that changed since the last sync.
 */
export async function incrementalSync(
  client: GmailClient,
  email: string,
  lastHistoryId: string,
  base?: string
): Promise<IncrementalSyncResult> {
  const profile = await client.getProfile();
  const currentHistoryId = profile.historyId ?? lastHistoryId;

  // If historyId hasn't changed, nothing to do
  if (currentHistoryId === lastHistoryId) {
    return { newHistoryId: currentHistoryId, threadsUpdated: 0 };
  }

  let history;
  try {
    history = await client.listHistory(lastHistoryId);
  } catch (err: any) {
    // If history is too old (404), fall back to full sync signal
    if (err?.response?.status === 404) {
      throw new HistoryExpiredError(
        "History ID expired. A full sync is needed."
      );
    }
    throw err;
  }

  // Collect unique thread IDs that changed
  const changedThreadIds = new Set<string>();

  if (history.history) {
    for (const entry of history.history) {
      // Messages added
      if (entry.messagesAdded) {
        for (const added of entry.messagesAdded) {
          const threadId = added.message?.threadId;
          if (threadId) changedThreadIds.add(threadId);
        }
      }
      // Label changes (read/unread, star, etc.)
      if (entry.labelsAdded) {
        for (const label of entry.labelsAdded) {
          const threadId = label.message?.threadId;
          if (threadId) changedThreadIds.add(threadId);
        }
      }
      if (entry.labelsRemoved) {
        for (const label of entry.labelsRemoved) {
          const threadId = label.message?.threadId;
          if (threadId) changedThreadIds.add(threadId);
        }
      }
    }
  }

  // Re-sync each changed thread
  for (const threadId of changedThreadIds) {
    await syncThread(client, email, threadId, base);
  }

  return {
    newHistoryId: currentHistoryId,
    threadsUpdated: changedThreadIds.size,
  };
}

export class HistoryExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryExpiredError";
  }
}
