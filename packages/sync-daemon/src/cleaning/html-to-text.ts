import { convert } from "html-to-text";

/**
 * Convert HTML email body to clean plain text.
 * Preserves paragraph structure and links, collapses decorative whitespace.
 */
export function htmlToCleanText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      // Preserve links as [text](url)
      { selector: "a", options: { linkBrackets: ["[", "](", ")"] as any } },
      // Skip images (inline tracking pixels etc.)
      { selector: "img", format: "skip" },
      // Skip style/script tags
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
    ],
    preserveNewlines: false,
  });
}
