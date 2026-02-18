import { readFile } from "node:fs/promises";
import { atomicWriteFile } from "./atomic-write.js";

/**
 * Read a JSONL file and parse each line into an object.
 * Returns an empty array if the file doesn't exist.
 */
export async function readJsonl<T>(filePath: string): Promise<T[]> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Write an array of objects as a JSONL file (one JSON object per line).
 * Uses atomic write to prevent partial reads.
 */
export async function writeJsonl<T>(
  filePath: string,
  items: T[]
): Promise<void> {
  const content = items.map((item) => JSON.stringify(item)).join("\n") + "\n";
  await atomicWriteFile(filePath, content);
}

/**
 * Upsert an item in a JSONL file by a key field.
 * If an item with the same key value exists, replace it. Otherwise append.
 * Returns the updated array.
 */
export async function upsertJsonl<T>(
  filePath: string,
  item: T,
  keyField: keyof T & string
): Promise<T[]> {
  const items = await readJsonl<T>(filePath);
  const keyValue = item[keyField];
  const idx = items.findIndex((existing) => existing[keyField] === keyValue);

  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }

  await writeJsonl(filePath, items);
  return items;
}
