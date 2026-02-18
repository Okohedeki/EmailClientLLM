import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Write data to a file atomically by writing to a .tmp sibling first,
 * then renaming. Prevents partial reads.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string
): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpName = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmpName, data, "utf-8");
  await rename(tmpName, filePath);
}

/**
 * Atomically write a JSON object to a file.
 */
export async function atomicWriteJson(
  filePath: string,
  data: unknown
): Promise<void> {
  await atomicWriteFile(filePath, JSON.stringify(data, null, 2) + "\n");
}
