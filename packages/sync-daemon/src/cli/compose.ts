/**
 * Compose and drop a draft into the outbox.
 * The running daemon will pick it up and send it.
 *
 * Usage: npx tsx packages/sync-daemon/src/cli/compose.ts
 */

import { readFile } from "node:fs/promises";
import {
  configPath,
  outboxDir,
  signaturePath,
  atomicWriteJson,
  type AppConfig,
  type OutboxDraft,
} from "@maildeck/shared";
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

  console.log(`\n  Compose email from: ${email}\n`);

  const to = await ask("  To: ");
  const subject = await ask("  Subject: ");
  console.log("  Body (end with an empty line — just press Enter twice):");

  const bodyLines: string[] = [];
  let emptyCount = 0;
  while (true) {
    const line = await ask("  > ");
    const trimmed = line.trim();
    if (trimmed === "") {
      emptyCount++;
      if (emptyCount >= 2) break;
      bodyLines.push("");
    } else {
      emptyCount = 0;
      bodyLines.push(line);
    }
  }

  // Remove trailing empty lines
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") {
    bodyLines.pop();
  }

  let body = bodyLines.join("\n");

  // Append signature if exists
  try {
    const sig = await readFile(signaturePath(email), "utf-8");
    if (sig.trim()) {
      body += `\n\n-- \n${sig.trim()}`;
    }
  } catch {
    // No signature file
  }

  await initAccountDirs(email);

  const draftFilename = `draft-${Date.now()}.json`;
  const draft: OutboxDraft = {
    action: "compose",
    to: to.split(",").map((s) => s.trim()),
    subject,
    body,
    created_at: new Date().toISOString(),
    created_by: "maildeck-cli",
    status: config.review_before_send ? "pending_review" : "ready_to_send",
  };

  const draftPath = `${outboxDir(email)}/${draftFilename}`;
  await atomicWriteJson(draftPath, draft);

  console.log(`\n  Draft saved: ${draftFilename}`);
  console.log(`  Status: ${draft.status}`);

  if (draft.status === "pending_review") {
    console.log(`\n  The daemon will detect this draft but won't send it yet.`);
    console.log(`  To approve, edit the draft and change status to "ready_to_send",`);
    console.log(`  or set review_before_send: false in config.json.`);
  } else {
    console.log(`\n  The daemon will send this automatically if it's running.`);
    console.log(`  If not, start it with: npm run start --workspace=packages/sync-daemon`);
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
