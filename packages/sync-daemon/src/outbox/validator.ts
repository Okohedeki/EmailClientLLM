import type { OutboxDraft, OutboxStatus } from "@maildeck/shared";
import { OUTBOX_STATUSES } from "@maildeck/shared";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an outbox draft JSON object.
 */
export function validateDraft(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Draft must be a JSON object"] };
  }

  const draft = data as Record<string, unknown>;

  // Required fields
  if (!draft.action || !["reply", "compose"].includes(draft.action as string)) {
    errors.push('action must be "reply" or "compose"');
  }

  if (draft.action === "reply") {
    if (!draft.thread_id || typeof draft.thread_id !== "string") {
      errors.push("thread_id is required for replies");
    }
  }

  if (!Array.isArray(draft.to) || draft.to.length === 0) {
    errors.push("to must be a non-empty array of email addresses");
  } else {
    for (const addr of draft.to) {
      if (typeof addr !== "string" || !addr.includes("@")) {
        errors.push(`Invalid email address in to: ${addr}`);
      }
    }
  }

  if (!draft.subject || typeof draft.subject !== "string") {
    errors.push("subject is required");
  }

  if (!draft.body || typeof draft.body !== "string") {
    errors.push("body is required");
  }

  if (draft.status && !OUTBOX_STATUSES.includes(draft.status as OutboxStatus)) {
    errors.push(`Invalid status: ${draft.status}. Must be one of: ${OUTBOX_STATUSES.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Type-safe cast after validation.
 */
export function parseDraft(data: unknown): OutboxDraft | null {
  const result = validateDraft(data);
  if (!result.valid) return null;
  return data as OutboxDraft;
}
