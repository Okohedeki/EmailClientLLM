import {
  readJsonl,
  writeJsonl,
  upsertJsonl,
  threadsIndexPath,
  contactsIndexPath,
  type ThreadIndexEntry,
  type ContactEntry,
} from "@clawmail3/shared";

/**
 * Upsert a thread into threads.jsonl, then re-sort newest-first by last_date.
 */
export async function upsertThreadIndex(
  email: string,
  entry: ThreadIndexEntry,
  base?: string
): Promise<void> {
  const filePath = threadsIndexPath(email, base);
  const items = await upsertJsonl(filePath, entry, "id");

  // Re-sort newest-first by last_date
  items.sort(
    (a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime()
  );

  await writeJsonl(filePath, items);
}

/**
 * Upsert a contact into contacts.jsonl.
 */
export async function upsertContactIndex(
  email: string,
  contact: ContactEntry,
  base?: string
): Promise<void> {
  const filePath = contactsIndexPath(email, base);
  await upsertJsonl(filePath, contact, "email");
}

/**
 * Read the current thread index.
 */
export async function readThreadIndex(
  email: string,
  base?: string
): Promise<ThreadIndexEntry[]> {
  return readJsonl<ThreadIndexEntry>(threadsIndexPath(email, base));
}

/**
 * Read the current contacts index.
 */
export async function readContactIndex(
  email: string,
  base?: string
): Promise<ContactEntry[]> {
  return readJsonl<ContactEntry>(contactsIndexPath(email, base));
}
