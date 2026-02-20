import { readFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { outboxDir, type OutboxDraft } from "@clawmail3/shared";
import type { GmailClient } from "../sync/gmail-client.js";
import { sendViaSMTP, type SmtpCredentials } from "../sync/smtp-sender.js";
import { transitionDraft } from "./state-machine.js";

/** Either a GmailClient (OAuth) or SmtpCredentials (IMAP path). */
export type SendClient =
  | { type: "oauth"; client: GmailClient }
  | { type: "smtp"; creds: SmtpCredentials };

/**
 * Process a ready_to_send draft: send via Gmail API (OAuth) or SMTP (App Password).
 */
export async function sendDraft(
  sendClient: SendClient,
  email: string,
  draftFilename: string,
  base?: string
): Promise<void> {
  const filePath = join(outboxDir(email, base), draftFilename);
  const raw = await readFile(filePath, "utf-8");
  const draft: OutboxDraft = JSON.parse(raw);

  if (draft.status !== "ready_to_send") {
    return; // Not ready
  }

  // Transition to sending
  await transitionDraft(email, draftFilename, "sending", undefined, base);

  try {
    if (sendClient.type === "oauth") {
      // Build RFC 822 message and send via Gmail API
      const rfc822 = await buildRfc822(draft, email);
      const result = await sendClient.client.sendMessage(rfc822);
      await transitionDraft(email, draftFilename, "sent", {
        gmail_message_id: result.id,
        gmail_thread_id: result.threadId,
      }, base);
    } else {
      // Send via SMTP
      const result = await sendViaSMTP(sendClient.creds, draft);
      await transitionDraft(email, draftFilename, "sent", {
        smtp_message_id: result.messageId,
      }, base);
    }
  } catch (err: any) {
    // Transition to failed
    await transitionDraft(email, draftFilename, "failed", {
      error: err.message ?? String(err),
    }, base);
  }
}

/**
 * Build an RFC 822 message string from a draft.
 * Uses nodemailer to build proper MIME when attachments are present.
 */
async function buildRfc822(draft: OutboxDraft, fromEmail: string): Promise<string> {
  if (draft.attachments && draft.attachments.length > 0) {
    // Use nodemailer to build multipart MIME message
    const mail = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const info = await mail.sendMail({
      from: fromEmail,
      to: draft.to.join(", "),
      cc: draft.cc?.join(", "),
      subject: draft.subject,
      text: draft.body,
      attachments: draft.attachments.map((a) => ({
        filename: a.filename,
        path: a.path,
        contentType: a.mime,
      })),
    });
    return (info.message as Buffer).toString("utf-8");
  }

  // Simple plain-text message (no attachments)
  const lines: string[] = [];
  lines.push(`From: ${fromEmail}`);
  lines.push(`To: ${draft.to.join(", ")}`);
  if (draft.cc && draft.cc.length > 0) {
    lines.push(`Cc: ${draft.cc.join(", ")}`);
  }
  lines.push(`Subject: ${draft.subject}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("");
  lines.push(draft.body);
  return lines.join("\r\n");
}
