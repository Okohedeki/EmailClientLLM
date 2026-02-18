import { convert } from "html-to-text";

/**
 * Convert HTML email body to clean plain text.
 * Preserves paragraph structure and links, strips images entirely.
 */
export function htmlToCleanText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      // Preserve links as [text](url) — but only if link text differs from URL
      {
        selector: "a",
        options: { linkBrackets: ["[", "](", ")"] as any },
      },
      // Skip images entirely (tracking pixels, decorative images, logos)
      { selector: "img", format: "skip" },
      // Skip style/script tags
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
    ],
    preserveNewlines: false,
  });
}
