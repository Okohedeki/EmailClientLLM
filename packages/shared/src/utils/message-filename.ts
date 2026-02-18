/**
 * Generate a message filename in the format:
 *   <UTC_ISO_BASIC>__msg<gmail_message_id>.md
 *
 * Example: 20260217T093000Z__msg18d4a7f2b3c1e001_005.md
 */
export function messageFilename(date: Date, gmailMessageId: string): string {
  const ts = toIsoBasic(date);
  return `${ts}__msg${gmailMessageId}.md`;
}

/**
 * Parse a message filename back into its components.
 * Returns null if the filename doesn't match the expected pattern.
 */
export function parseMessageFilename(
  filename: string
): { date: Date; gmailMessageId: string } | null {
  const match = filename.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z__msg(.+)\.md$/
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second, msgId] = match;
  const date = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
  );
  return { date, gmailMessageId: msgId };
}

/**
 * Convert a Date to ISO basic format: YYYYMMDDTHHmmssZ
 */
function toIsoBasic(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const h = pad2(date.getUTCHours());
  const mi = pad2(date.getUTCMinutes());
  const s = pad2(date.getUTCSeconds());
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
