import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  atomicWriteJson,
  outboxDir,
  sentDir,
  failedDir,
  OUTBOX_TRANSITIONS,
  type OutboxDraft,
  type OutboxStatus,
} from "@clawmail3/shared";

/**
 * Transition a draft to a new status.
 * Validates the transition is allowed. Moves file to sent/ or failed/ on terminal states.
 */
export async function transitionDraft(
  email: string,
  draftFilename: string,
  newStatus: OutboxStatus,
  extra?: Record<string, unknown>,
  base?: string
): Promise<void> {
  const outbox = outboxDir(email, base);
  const filePath = join(outbox, draftFilename);

  const raw = await readFile(filePath, "utf-8");
  const draft: OutboxDraft = JSON.parse(raw);

  // Validate transition
  const allowed = OUTBOX_TRANSITIONS[draft.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new InvalidTransitionError(draft.status, newStatus);
  }

  const updated = { ...draft, status: newStatus, ...extra };

  if (newStatus === "sent") {
    // Move to sent/
    const destPath = join(sentDir(email, base), draftFilename);
    await atomicWriteJson(destPath, {
      ...updated,
      sent_at: new Date().toISOString(),
    });
    const { unlink } = await import("node:fs/promises");
    await unlink(filePath);
  } else if (newStatus === "failed") {
    // Move to failed/
    const destPath = join(failedDir(email, base), draftFilename);
    await atomicWriteJson(destPath, {
      ...updated,
      failed_at: new Date().toISOString(),
    });
    const { unlink } = await import("node:fs/promises");
    await unlink(filePath);
  } else {
    // Update in place
    await atomicWriteJson(filePath, updated);
  }
}

/**
 * Auto-promote pending_review → ready_to_send when review is disabled.
 */
export async function autoPromote(
  email: string,
  draftFilename: string,
  base?: string
): Promise<void> {
  await transitionDraft(email, draftFilename, "ready_to_send", undefined, base);
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}
