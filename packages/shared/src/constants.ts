import { homedir } from "node:os";
import { join } from "node:path";

/** Root data directory */
export const MAILDECK_BASE_DIR = join(homedir(), ".clawmail3");

/** Status enums for outbox drafts */
export const OUTBOX_STATUSES = [
  "pending_review",
  "ready_to_send",
  "sending",
  "sent",
  "failed",
] as const;

/** Valid outbox status transitions */
export const OUTBOX_TRANSITIONS: Record<string, string[]> = {
  pending_review: ["ready_to_send"],
  ready_to_send: ["sending"],
  sending: ["sent", "failed"],
};

/** Directory names within an account */
export const ACCOUNT_DIRS = {
  index: "index",
  threads: "threads",
  outbox: "outbox",
  sent: "sent",
  failed: "failed",
} as const;

/** Index file names */
export const INDEX_FILES = {
  threads: "threads.jsonl",
  contacts: "contacts.jsonl",
  commitments: "commitments.jsonl",
} as const;

/** Default config values */
export const DEFAULTS = {
  syncDepthDays: 30,
  pollIntervalSeconds: 60,
  reviewBeforeSend: true,
} as const;
