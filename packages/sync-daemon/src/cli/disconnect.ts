/**
 * Disconnect a Gmail account from ClawMail3.
 *
 * Usage:
 *   npx tsx packages/sync-daemon/src/cli/disconnect.ts [email]
 *
 * What it does:
 *   1. Deletes OAuth tokens from OS keychain
 *   2. Removes the account from config.json
 *   3. Optionally deletes synced data from ~/.clawmail3/accounts/<email>/
 */

import readline from "node:readline";
import { readFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import {
  configPath,
  accountDir,
  atomicWriteJson,
  type AppConfig,
} from "@clawmail3/shared";
import { deleteAllCredentials } from "../sync/keychain.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║     ClawMail3 — Disconnect Account    ║");
  console.log("╚══════════════════════════════════════╝\n");

  // Load config
  let config: AppConfig;
  try {
    const raw = await readFile(configPath(), "utf-8");
    config = JSON.parse(raw);
  } catch {
    console.error("No config.json found. Nothing to disconnect.");
    process.exit(1);
  }

  // Determine which account
  let email = process.argv[2];

  if (!email) {
    if (config.accounts.length === 0) {
      console.log("No accounts configured.");
      process.exit(0);
    }
    if (config.accounts.length === 1) {
      email = config.accounts[0];
    } else {
      console.log("Configured accounts:");
      config.accounts.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
      const choice = await ask("\nWhich account to disconnect? (number): ");
      const idx = parseInt(choice, 10) - 1;
      if (idx < 0 || idx >= config.accounts.length) {
        console.error("Invalid choice.");
        process.exit(1);
      }
      email = config.accounts[idx];
    }
  }

  console.log(`\nDisconnecting: ${email}\n`);

  // Step 1: Delete all credentials from keychain (app password + OAuth tokens)
  await deleteAllCredentials(email);
  console.log("✓ Credentials removed from OS keychain.");

  // Step 2: Remove from config
  config.accounts = config.accounts.filter((a) => a !== email);
  await atomicWriteJson(configPath(), config);
  console.log("✓ Account removed from config.json.");

  // Step 3: Optionally delete synced data
  const deleteData = await ask(
    `\nDelete synced data at ~/.clawmail3/accounts/${email}/ ? (y/N): `
  );
  if (deleteData.toLowerCase() === "y") {
    const dir = accountDir(email);
    await rm(dir, { recursive: true, force: true });
    console.log("✓ Synced data deleted.");
  } else {
    console.log("✓ Synced data kept (you can delete it manually later).");
  }

  // Step 4: Optionally delete client credentials
  if (config.accounts.length === 0) {
    const deleteCreds = await ask(
      "\nNo accounts remaining. Delete OAuth client credentials from keychain? (y/N): "
    );
    if (deleteCreds.toLowerCase() === "y") {
      const keytar = await import("keytar");
      await keytar.default.deletePassword("clawmail3", "__client_credentials__");
      console.log("✓ Client credentials removed.");
    }
  }

  console.log("\nDone. Account disconnected.\n");
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("\nDisconnect failed:", err.message);
  process.exit(1);
});
