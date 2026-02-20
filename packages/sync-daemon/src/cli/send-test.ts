/**
 * Test the outbox send flow: create a draft → transition → send via SMTP.
 *
 * Usage: npx tsx packages/sync-daemon/src/cli/send-test.ts
 *
 * Sends a test email TO YOURSELF to verify SMTP works.
 */

import { readFile, mkdir } from "node:fs/promises";
import {
  configPath,
  outboxDir,
  atomicWriteJson,
  type AppConfig,
  type OutboxDraft,
} from "@clawmail3/shared";
import { getAppPassword } from "../sync/keychain.js";
import { sendViaSMTP } from "../sync/smtp-sender.js";
import { transitionDraft } from "../outbox/state-machine.js";
import { initAccountDirs } from "../storage/directory-init.js";
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  const raw = await readFile(configPath(), "utf-8");
  const config: AppConfig = JSON.parse(raw);
  const email = config.accounts[0];

  if (!email) {
    console.error("No accounts configured. Run setup first.");
    process.exit(1);
  }

  const appPassword = await getAppPassword(email);
  if (!appPassword) {
    console.error("No app password found. Run setup first.");
    process.exit(1);
  }

  console.log(`\n  Send test email from: ${email}`);
  console.log(`  This will send a test email TO YOURSELF.\n`);

  const confirm = await ask("  Proceed? [Y/n]: ");
  if (confirm.toLowerCase() === "n") {
    console.log("  Cancelled.");
    process.exit(0);
  }

  // Ensure outbox dir exists
  await initAccountDirs(email);

  // Create a test draft in the outbox
  const draftFilename = `test-${Date.now()}.json`;
  const draft: OutboxDraft = {
    action: "compose",
    to: [email], // Send to self
    subject: "ClawMail3 test email",
    body: `This is a test email from ClawMail3.\n\nSent at: ${new Date().toISOString()}\n\nIf you're reading this, SMTP sending works!`,
    created_at: new Date().toISOString(),
    created_by: "clawmail3-test",
    status: "pending_review",
  };

  const draftPath = `${outboxDir(email)}/${draftFilename}`;
  await atomicWriteJson(draftPath, draft);
  console.log(`\n  Draft created: ${draftFilename}`);
  console.log(`  Status: pending_review`);

  // Transition: pending_review → ready_to_send
  await transitionDraft(email, draftFilename, "ready_to_send");
  console.log(`  Status: ready_to_send`);

  // Transition: ready_to_send → sending
  await transitionDraft(email, draftFilename, "sending");
  console.log(`  Status: sending`);

  // Actually send via SMTP
  try {
    const result = await sendViaSMTP({ email, appPassword }, draft);
    console.log(`  Sent! Message-ID: ${result.messageId}`);

    // Transition: sending → sent (move to sent/)
    await transitionDraft(email, draftFilename, "sent", {
      smtp_message_id: result.messageId,
    });
    console.log(`  Status: sent (moved to sent/)`);
    console.log(`\n  Check your inbox for the test email!`);
  } catch (err: any) {
    console.error(`\n  Send failed: ${err.message}`);

    // Transition: sending → failed
    await transitionDraft(email, draftFilename, "failed", {
      error: err.message,
    });
    console.log(`  Status: failed (moved to failed/)`);
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
