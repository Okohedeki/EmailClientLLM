/**
 * Quick re-sync script — uses stored credentials, no prompts.
 * Usage: npx tsx packages/sync-daemon/src/cli/resync.ts [--days N] [--max N]
 */

import { readFile } from "node:fs/promises";
import { configPath, type AppConfig } from "@clawmail3/shared";
import { getAppPassword } from "../sync/keychain.js";
import { ImapClient } from "../sync/imap-client.js";
import { imapFullSync } from "../sync/imap-sync.js";

async function main() {
  const args = process.argv.slice(2);
  let days = 30;
  let max = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days") days = parseInt(args[++i], 10);
    if (args[i] === "--max") max = parseInt(args[++i], 10);
  }

  const raw = await readFile(configPath(), "utf-8");
  const config: AppConfig = JSON.parse(raw);
  const email = config.accounts[0];

  if (!email) {
    console.error("No accounts configured.");
    process.exit(1);
  }

  const appPassword = await getAppPassword(email);
  if (!appPassword) {
    console.error("No app password found. Run setup first.");
    process.exit(1);
  }

  console.log(`Re-syncing ${email} (${days} days, max ${max} messages)...`);

  const client = new ImapClient({ email, appPassword });
  const result = await imapFullSync(client, {
    email,
    depthDays: days,
    maxMessages: max,
    onProgress: (done, total) => {
      process.stdout.write(`\r  Progress: ${done}/${total} threads`);
    },
  });

  console.log(`\n  Done! ${result.threadCount} threads, last UID: ${result.lastUid}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
