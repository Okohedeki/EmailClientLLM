import nodemailer from "nodemailer";
import type { OutboxDraft } from "@maildeck/shared";

export interface SmtpCredentials {
  email: string;
  appPassword: string;
  host?: string;
  port?: number;
}

/**
 * Send email via SMTP (Gmail or other provider).
 * Uses App Password auth.
 */
export async function sendViaSMTP(
  creds: SmtpCredentials,
  draft: OutboxDraft
): Promise<{ messageId: string }> {
  const transport = nodemailer.createTransport({
    host: creds.host ?? "smtp.gmail.com",
    port: creds.port ?? 465,
    secure: true,
    auth: {
      user: creds.email,
      pass: creds.appPassword,
    },
  });

  const result = await transport.sendMail({
    from: creds.email,
    to: draft.to.join(", "),
    cc: draft.cc?.join(", "),
    subject: draft.subject,
    text: draft.body,
    attachments: draft.attachments?.map((a) => ({
      filename: a.filename,
      path: a.path,
      contentType: a.mime,
    })),
  });

  return { messageId: result.messageId };
}
