import { mkdir } from "node:fs/promises";
import {
  accountDir,
  indexDir,
  outboxDir,
  sentDir,
  failedDir,
  logsDir,
} from "@maildeck/shared";

/**
 * Create the full directory tree for a MailDeck account.
 * Safe to call multiple times (uses recursive: true).
 */
export async function initAccountDirs(
  email: string,
  base?: string
): Promise<void> {
  const dirs = [
    indexDir(email, base),
    outboxDir(email, base),
    sentDir(email, base),
    failedDir(email, base),
    logsDir(base),
  ];

  await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));
}

/**
 * Create the directory tree for a specific thread.
 */
export async function initThreadDirs(
  email: string,
  threadId: string,
  base?: string
): Promise<void> {
  const { messagesDir, attachmentsDir } = await import("@maildeck/shared");
  await Promise.all([
    mkdir(messagesDir(email, threadId, base), { recursive: true }),
    mkdir(attachmentsDir(email, threadId, base), { recursive: true }),
  ]);
}
