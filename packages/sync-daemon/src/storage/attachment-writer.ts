import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { attachmentsDir } from "@maildeck/shared";
import type { ParsedAttachment } from "../cleaning/index.js";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Save attachments from a parsed email to the thread's attachments/ directory.
 * Returns metadata for each saved attachment. Attachments exceeding the size
 * limit are recorded in metadata with `skipped: true` but not written to disk.
 */
export async function writeAttachments(
  email: string,
  threadId: string,
  attachments: ParsedAttachment[],
  base?: string
): Promise<{ filename: string; mime: string; size_bytes: number; skipped?: boolean }[]> {
  if (attachments.length === 0) return [];

  const dir = attachmentsDir(email, threadId, base);
  await mkdir(dir, { recursive: true });

  const results: { filename: string; mime: string; size_bytes: number; skipped?: boolean }[] = [];

  for (const att of attachments) {
    const safeName = sanitizeFilename(att.filename);

    if (att.size > MAX_ATTACHMENT_BYTES) {
      results.push({
        filename: safeName,
        mime: att.contentType,
        size_bytes: att.size,
        skipped: true,
      });
      continue;
    }

    const filePath = join(dir, safeName);
    await writeFile(filePath, att.content);
    results.push({
      filename: safeName,
      mime: att.contentType,
      size_bytes: att.size,
    });
  }

  return results;
}

/**
 * Sanitize a filename to prevent path traversal and invalid chars.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\.\./g, "_")
    .trim() || "attachment";
}
