/**
 * IMAP debug script — diagnose why messages aren't being found.
 *
 * Usage: npx tsx packages/sync-daemon/src/cli/imap-debug.ts
 */

import { ImapFlow } from "imapflow";
import { getAppPassword } from "../sync/keychain.js";
import { readFile } from "node:fs/promises";
import { configPath, type AppConfig } from "@maildeck/shared";

async function main() {
  let email: string;
  try {
    const raw = await readFile(configPath(), "utf-8");
    const config: AppConfig = JSON.parse(raw);
    if (config.accounts.length === 0) {
      console.error("No accounts configured. Run setup first.");
      process.exit(1);
    }
    email = config.accounts[0];
  } catch {
    console.error("No config found. Run setup first.");
    process.exit(1);
  }

  const appPassword = await getAppPassword(email);
  if (!appPassword) {
    console.error("No app password found. Run setup first.");
    process.exit(1);
  }

  console.log(`\nDebug IMAP for: ${email}\n`);

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
  });

  await client.connect();
  console.log("Connected\n");

  // List mailboxes
  const mailboxes = await client.list();
  console.log("Mailboxes:");
  for (const box of mailboxes) {
    console.log(`  ${box.path}  (${box.specialUse || "no special use"})`);
  }

  // Debug a mailbox
  async function debugMailbox(name: string) {
    console.log(`\n--- ${name} ---`);
    try {
      const lock = await client.getMailboxLock(name);
      try {
        const mb = client.mailbox;
        if (mb && typeof mb !== "boolean") {
          console.log(`  Total messages: ${mb.exists}`);
          console.log(`  UIDNEXT: ${mb.uidNext}`);
        }

        const allUids = await client.search({ all: true }, { uid: true });
        const allArr = Array.isArray(allUids) ? allUids : [];
        console.log(`  search({all: true}): ${allArr.length} UIDs`);

        if (allArr.length > 0) {
          console.log(`  UID range: ${allArr[0]} - ${allArr[allArr.length - 1]}`);
        }

        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceUids = await client.search({ since }, { uid: true });
        const sinceArr = Array.isArray(sinceUids) ? sinceUids : [];
        console.log(`  search({since: ${since.toISOString().split("T")[0]}}): ${sinceArr.length} UIDs`);

        // Try fetching one message
        if (allArr.length > 0) {
          const lastUid = allArr[allArr.length - 1];
          console.log(`\n  Fetching UID ${lastUid} (with uid:true in 3rd arg)...`);
          for await (const msg of client.fetch([lastUid], {
            envelope: true,
            flags: true,
          }, { uid: true })) {
            console.log(`    UID: ${msg.uid}`);
            console.log(`    Subject: ${msg.envelope?.subject}`);
            console.log(`    Date: ${msg.envelope?.date}`);
            console.log(`    From: ${msg.envelope?.from?.[0]?.address}`);
            console.log(`    Flags: ${[...(msg.flags ?? [])].join(", ")}`);
          }
        }
      } finally {
        lock.release();
      }
    } catch (err: any) {
      console.log(`  Failed: ${err.message}`);
    }
  }

  await debugMailbox("INBOX");
  await debugMailbox("[Gmail]/All Mail");

  await client.logout();
  console.log("\nDone\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
