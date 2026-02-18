import { join } from "node:path";
import { MAILDECK_BASE_DIR, ACCOUNT_DIRS, INDEX_FILES } from "../constants.js";

/** Resolve the root maildeck directory, with optional override for testing. */
export function baseDir(override?: string): string {
  return override ?? MAILDECK_BASE_DIR;
}

/** ~/.maildeck/config.json */
export function configPath(base?: string): string {
  return join(baseDir(base), "config.json");
}

/** ~/.maildeck/logs/ */
export function logsDir(base?: string): string {
  return join(baseDir(base), "logs");
}

/** ~/.maildeck/accounts/<email>/ */
export function accountDir(email: string, base?: string): string {
  return join(baseDir(base), "accounts", email);
}

/** ~/.maildeck/accounts/<email>/account.json */
export function accountMetaPath(email: string, base?: string): string {
  return join(accountDir(email, base), "account.json");
}

/** ~/.maildeck/accounts/<email>/labels.json */
export function labelsPath(email: string, base?: string): string {
  return join(accountDir(email, base), "labels.json");
}

/** ~/.maildeck/accounts/<email>/index/ */
export function indexDir(email: string, base?: string): string {
  return join(accountDir(email, base), ACCOUNT_DIRS.index);
}

/** ~/.maildeck/accounts/<email>/index/threads.jsonl */
export function threadsIndexPath(email: string, base?: string): string {
  return join(indexDir(email, base), INDEX_FILES.threads);
}

/** ~/.maildeck/accounts/<email>/index/contacts.jsonl */
export function contactsIndexPath(email: string, base?: string): string {
  return join(indexDir(email, base), INDEX_FILES.contacts);
}

/** ~/.maildeck/accounts/<email>/index/commitments.jsonl */
export function commitmentsIndexPath(email: string, base?: string): string {
  return join(indexDir(email, base), INDEX_FILES.commitments);
}

/** ~/.maildeck/accounts/<email>/threads/<threadId>/ */
export function threadDir(
  email: string,
  threadId: string,
  base?: string
): string {
  return join(accountDir(email, base), ACCOUNT_DIRS.threads, threadId);
}

/** ~/.maildeck/accounts/<email>/threads/<threadId>/thread.json */
export function threadMetaPath(
  email: string,
  threadId: string,
  base?: string
): string {
  return join(threadDir(email, threadId, base), "thread.json");
}

/** ~/.maildeck/accounts/<email>/threads/<threadId>/messages/ */
export function messagesDir(
  email: string,
  threadId: string,
  base?: string
): string {
  return join(threadDir(email, threadId, base), "messages");
}

/** ~/.maildeck/accounts/<email>/threads/<threadId>/attachments/ */
export function attachmentsDir(
  email: string,
  threadId: string,
  base?: string
): string {
  return join(threadDir(email, threadId, base), "attachments");
}

/** ~/.maildeck/accounts/<email>/outbox/ */
export function outboxDir(email: string, base?: string): string {
  return join(accountDir(email, base), ACCOUNT_DIRS.outbox);
}

/** ~/.maildeck/accounts/<email>/sent/ */
export function sentDir(email: string, base?: string): string {
  return join(accountDir(email, base), ACCOUNT_DIRS.sent);
}

/** ~/.maildeck/accounts/<email>/failed/ */
export function failedDir(email: string, base?: string): string {
  return join(accountDir(email, base), ACCOUNT_DIRS.failed);
}
