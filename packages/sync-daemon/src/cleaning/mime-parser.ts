import { simpleParser, type ParsedMail } from "mailparser";

export interface ParsedMessage {
  messageId: string | undefined;
  inReplyTo: string | undefined;
  references: string[];
  from: { address: string; name: string } | undefined;
  to: string[];
  cc: string[];
  subject: string;
  date: Date | undefined;
  textBody: string | undefined;
  htmlBody: string | undefined;
  attachments: ParsedAttachment[];
}

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
  size: number;
  contentId?: string;
}

/**
 * Parse raw email (RFC 822 / MIME) into structured components.
 * Accepts a Buffer or string of the raw email source.
 */
export async function parseMime(raw: Buffer | string): Promise<ParsedMessage> {
  const parsed: ParsedMail = await simpleParser(raw);

  const from = parsed.from?.value?.[0];
  const to = parsed.to
    ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap((addr) =>
        addr.value.map((v) => v.address ?? "")
      )
    : [];
  const cc = parsed.cc
    ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap((addr) =>
        addr.value.map((v) => v.address ?? "")
      )
    : [];

  // Normalize references — can be string or string[]
  let references: string[] = [];
  if (parsed.references) {
    references = Array.isArray(parsed.references)
      ? parsed.references
      : [parsed.references];
  }

  const attachments: ParsedAttachment[] = parsed.attachments.map((att) => ({
    filename: att.filename ?? "attachment",
    contentType: att.contentType,
    content: att.content,
    size: att.size,
    contentId: att.contentId || undefined,
  }));

  return {
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    references,
    from: from
      ? { address: from.address ?? "", name: from.name ?? "" }
      : undefined,
    to: to.filter(Boolean),
    cc: cc.filter(Boolean),
    subject: parsed.subject ?? "(no subject)",
    date: parsed.date,
    textBody: parsed.text,
    htmlBody: parsed.html || undefined,
    attachments,
  };
}
