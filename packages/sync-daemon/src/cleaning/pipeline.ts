import type { MessageFrontmatter } from "@clawmail3/shared";
import { parseMime, type ParsedAttachment } from "./mime-parser.js";
import { htmlToCleanText } from "./html-to-text.js";
import { stripQuotes } from "./quote-stripper.js";
import { stripSignature } from "./signature-stripper.js";
import { normalizeNoise } from "./noise-normalizer.js";
import { generateSnippet } from "./snippet-generator.js";

export interface CleanedMessage {
  frontmatter: MessageFrontmatter;
  body: string;
  snippet: string;
  attachments: ParsedAttachment[];
}

/**
 * Full cleaning pipeline: raw email → cleaned message with frontmatter.
 *
 * Steps:
 * 1. MIME parse (extract headers, text/html, attachments)
 * 2. HTML → plain text (if no text/plain part)
 * 3. Quote chain removal
 * 4. Signature stripping
 * 5. Noise normalization
 * 6. Snippet generation
 */
export async function cleanEmail(
  raw: Buffer | string,
  threadId: string,
  gmailMessageId: string
): Promise<CleanedMessage> {
  // Step 1: MIME parse
  const parsed = await parseMime(raw);

  // Step 2: Get text body — prefer text/plain, fall back to HTML conversion
  let body: string;
  if (parsed.textBody) {
    body = parsed.textBody;
  } else if (parsed.htmlBody) {
    body = htmlToCleanText(parsed.htmlBody);
  } else {
    body = "";
  }

  // Step 3: Strip quoted reply chains
  body = stripQuotes(body);

  // Step 4: Strip signatures and disclaimers
  body = stripSignature(body);

  // Step 5: Normalize noise (whitespace, UTM params, Unicode)
  body = normalizeNoise(body);

  // Step 6: Generate snippet
  const snippet = generateSnippet(body);

  // Build frontmatter
  const frontmatter: MessageFrontmatter = {
    id: `msg_${gmailMessageId}`,
    gmail_message_id: gmailMessageId,
    thread_id: threadId,
    rfc822_message_id: parsed.messageId,
    in_reply_to: parsed.inReplyTo,
    references: parsed.references.length > 0 ? parsed.references : undefined,
    from: parsed.from?.address ?? "unknown",
    from_name: parsed.from?.name ?? "",
    to: parsed.to.join(", "),
    cc: parsed.cc.length > 0 ? parsed.cc.join(", ") : undefined,
    date: (parsed.date ?? new Date()).toISOString(),
  };

  return {
    frontmatter,
    body,
    snippet,
    attachments: parsed.attachments,
  };
}
