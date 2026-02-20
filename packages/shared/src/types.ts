// ── Thread Index (threads.jsonl line) ────────────────────────────────

export interface ThreadIndexEntry {
  id: string;
  subject: string;
  from: string;
  from_name: string;
  participants: string[];
  labels: string[];
  unread: boolean;
  starred: boolean;
  msg_count: number;
  last_date: string; // ISO 8601
  first_date: string; // ISO 8601
  snippet: string;
  has_attachments: boolean;
  size_bytes: number;
}

// ── Thread Metadata (thread.json) ────────────────────────────────────

export interface ThreadParticipant {
  email: string;
  name: string;
  role: "self" | "external";
}

export interface AttachmentMeta {
  filename: string;
  mime: string;
  size_bytes: number;
}

export interface ThreadMeta {
  id: string;
  subject: string;
  labels: string[];
  unread: boolean;
  starred: boolean;
  participants: ThreadParticipant[];
  message_count: number;
  first_date: string;
  last_date: string;
  has_attachments: boolean;
  attachments: AttachmentMeta[];
}

// ── Contact Index (contacts.jsonl line) ──────────────────────────────

export interface ContactEntry {
  email: string;
  name: string;
  first_seen: string; // ISO date
  last_seen: string;
  msg_count: number;
  labels_common: string[];
  is_frequent: boolean;
}

// ── Message Frontmatter ─────────────────────────────────────────────

export interface MessageFrontmatter {
  id: string;
  gmail_message_id: string;
  thread_id: string;
  rfc822_message_id?: string;
  in_reply_to?: string;
  references?: string[];
  from: string;
  from_name: string;
  to: string;
  cc?: string;
  date: string; // ISO 8601
}

// ── Outbox Draft ─────────────────────────────────────────────────────

export type OutboxStatus =
  | "pending_review"
  | "ready_to_send"
  | "sending"
  | "sent"
  | "failed";

export interface OutboxAttachment {
  filename: string;
  path: string; // absolute path to file on disk
  mime: string;
}

export interface OutboxDraft {
  action: "reply" | "compose";
  thread_id?: string;
  in_reply_to?: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachments?: OutboxAttachment[];
  created_at: string;
  created_by: string;
  status: OutboxStatus;
}

// ── App Config (config.json) ─────────────────────────────────────────

export interface AppConfig {
  review_before_send: boolean;
  accounts: string[]; // email addresses
}

// ── Account Metadata (account.json) ──────────────────────────────────

export interface AccountMeta {
  email: string;
  sync_state: "idle" | "syncing" | "error";
  last_sync: string | null;
  history_id: string | null;
  sync_depth_days: number;
  poll_interval_seconds: number;
}

// ── Commitment (commitments.jsonl line) ──────────────────────────────

export interface CommitmentEntry {
  thread_id: string;
  date_made: string;
  to: string;
  commitment: string;
  deadline: string | null;
  status: "open" | "done" | "overdue";
}
