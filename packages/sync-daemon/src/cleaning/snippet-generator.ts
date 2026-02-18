/**
 * Generate a short snippet from a cleaned email body.
 * Used in threads.jsonl index for fast scanning without opening files.
 *
 * @param maxLength Maximum snippet length (default 300 chars)
 */
export function generateSnippet(body: string, maxLength = 300): string {
  // Collapse whitespace to single spaces
  const collapsed = body.replace(/\s+/g, " ").trim();

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  // Cut at last word boundary before maxLength
  const truncated = collapsed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}
