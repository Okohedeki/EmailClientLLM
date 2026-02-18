import { join } from "node:path";
import {
  atomicWriteJson,
  atomicWriteFile,
  threadMetaPath,
  messagesDir,
  messageFilename,
  type ThreadMeta,
  type MessageFrontmatter,
} from "@maildeck/shared";
import { initThreadDirs } from "./directory-init.js";

/**
 * Write or update a thread.json metadata file.
 */
export async function writeThreadMeta(
  email: string,
  threadMeta: ThreadMeta,
  base?: string
): Promise<void> {
  await initThreadDirs(email, threadMeta.id, base);
  await atomicWriteJson(threadMetaPath(email, threadMeta.id, base), threadMeta);
}

/**
 * Write a single message as a .md file with YAML frontmatter.
 * File is named with timestamp prefix for natural sort order.
 */
export async function writeMessage(
  email: string,
  threadId: string,
  frontmatter: MessageFrontmatter,
  body: string,
  base?: string
): Promise<string> {
  await initThreadDirs(email, threadId, base);

  const date = new Date(frontmatter.date);
  const filename = messageFilename(date, frontmatter.gmail_message_id);
  const filePath = join(messagesDir(email, threadId, base), filename);

  const content = renderMessageMd(frontmatter, body);
  await atomicWriteFile(filePath, content);

  return filename;
}

/**
 * Render a message as markdown with YAML frontmatter.
 */
function renderMessageMd(fm: MessageFrontmatter, body: string): string {
  const lines: string[] = ["---"];
  lines.push(`id: ${fm.id}`);
  lines.push(`gmail_message_id: ${fm.gmail_message_id}`);
  lines.push(`thread_id: ${fm.thread_id}`);
  if (fm.rfc822_message_id) lines.push(`rfc822_message_id: "${fm.rfc822_message_id}"`);
  if (fm.in_reply_to) lines.push(`in_reply_to: "${fm.in_reply_to}"`);
  if (fm.references && fm.references.length > 0) {
    lines.push(`references: ${JSON.stringify(fm.references)}`);
  }
  lines.push(`from: ${fm.from}`);
  lines.push(`from_name: ${fm.from_name}`);
  lines.push(`to: ${fm.to}`);
  if (fm.cc) lines.push(`cc: ${fm.cc}`);
  lines.push(`date: ${fm.date}`);
  lines.push("---");
  lines.push("");
  lines.push(body);
  lines.push("");

  return lines.join("\n");
}
