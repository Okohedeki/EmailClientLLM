import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { attachmentsDir } from "@clawmail3/shared";
import type { ParsedAttachment } from "../cleaning/index.js";

/**
 * Save attachments from a parsed email to the thread's attachments/ directory.
 * Returns metadata for each saved attachment.
 */
export async function writeAttachments(
  email: string,
  threadId: string,
  attachments: ParsedAttachment[],
  base?: string
): Promise<{ filename: string; mime: string; size_bytes: number }[]> {
  if (attachments.length === 0) return [];

  const dir = attachmentsDir(email, threadId, base);
  await mkdir(dir, { recursive: true });

  const results: { filename: string; mime: string; size_bytes: number }[] = [];

  for (const att of attachments) {
    const safeName = sanitizeFilename(att.filename);
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
