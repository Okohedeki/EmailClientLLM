// @ts-ignore — email-reply-parser has no type declarations
import EmailReplyParser from "email-reply-parser";

/**
 * Strip quoted reply chains from an email body.
 * Uses GitHub's email-reply-parser algorithm to detect and remove
 * "On <date>, <name> wrote:" blocks, forwarded headers, etc.
 *
 * Returns only the new content the sender actually wrote.
 */
export function stripQuotes(text: string): string {
  const parser = new EmailReplyParser();
  const email = parser.read(text);

  // Get only visible (non-quoted) fragments
  const visible = email
    .getVisibleText()
    .trim();

  // If stripping removed almost everything, fall back to original
  if (visible.length < 10 && text.trim().length > 50) {
    return text.trim();
  }

  return visible;
}
