/**
 * Interactive setup CLI for MailDeck.
 *
 * Usage:
 *   npx tsx packages/sync-daemon/src/cli/setup.ts
 *
 * Default: IMAP + App Password (no Google Cloud Console needed)
 * Option:  Gmail OAuth (requires Google Cloud project)
 */

import { createServer } from "node:http";
import { URL } from "node:url";
import readline from "node:readline";
import {
  configPath,
  accountMetaPath,
  signaturePath,
  atomicWriteJson,
  type AppConfig,
  type AccountMeta,
  DEFAULTS,
} from "@maildeck/shared";
import { readFile, writeFile } from "node:fs/promises";
import {
  storeAppPassword,
  storeClientCredentials,
  getClientCredentials,
} from "../sync/keychain.js";
import { ImapClient } from "../sync/imap-client.js";
import { imapFullSync } from "../sync/imap-sync.js";
import { initAccountDirs } from "../storage/directory-init.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();

    let input = "";
    const onData = (ch: Buffer) => {
      const c = ch.toString("utf-8");
      if (c === "\n" || c === "\r") {
        if (stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (c === "\u0003") {
        process.exit(0);
      } else if (c === "\u007f" || c === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        input += c;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  console.log("");
  console.log("  ╔══════════════════════════════════════╗");
  console.log("  ║       MailDeck — Account Setup       ║");
  console.log("  ╚══════════════════════════════════════╝");
  console.log("");

  console.log("  Connection methods:");
  console.log("    1. App Password (recommended — no Google Cloud setup needed)");
  console.log("    2. Gmail OAuth  (advanced — requires Google Cloud project)");
  console.log("");

  const method = await ask("  Choose method [1]: ");
  const useOAuth = method.trim() === "2";

  if (useOAuth) {
    await setupOAuth();
  } else {
    await setupAppPassword();
  }

  rl.close();
  process.exit(0);
}

// ── IMAP + App Password Setup ───────────────────────────────────────

async function setupAppPassword() {
  console.log("");
  console.log("  ┌─ App Password Setup ─────────────────────────┐");
  console.log("  │                                               │");
  console.log("  │  1. Go to myaccount.google.com/apppasswords   │");
  console.log("  │  2. You may need to enable 2-Step Verification│");
  console.log("  │  3. Create an app password (name: MailDeck)   │");
  console.log("  │  4. Copy the 16-character password            │");
  console.log("  │                                               │");
  console.log("  └───────────────────────────────────────────────┘");
  console.log("");

  const email = await ask("  Gmail address: ");
  if (!email.trim() || !email.includes("@")) {
    console.error("  Invalid email address.");
    return;
  }

  const appPassword = await askHidden("  App Password: ");
  if (!appPassword.trim()) {
    console.error("  App password is required.");
    return;
  }

  // Remove spaces from app password (Google formats them as "xxxx xxxx xxxx xxxx")
  const cleanPassword = appPassword.replace(/\s/g, "");

  // Test connection
  console.log("\n  Testing connection...");
  const client = new ImapClient({ email: email.trim(), appPassword: cleanPassword });

  try {
    await client.connect();

    // List mailboxes so we can verify folder names
    const mailboxes = await client.listMailboxes();
    console.log("  ✓ Connection successful!\n");
    console.log("  Available mailboxes:");
    for (const box of mailboxes) {
      console.log(`    - ${box}`);
    }
    console.log("");

    await client.disconnect();
  } catch (err: any) {
    console.error(`  ✗ Connection failed: ${err.message}`);
    console.error("    Check your email and app password, and ensure IMAP is enabled in Gmail settings.");
    return;
  }

  // Store credentials
  await storeAppPassword(email.trim(), cleanPassword);
  console.log("  ✓ Credentials stored in OS keychain (Windows Credential Manager)");

  // Write config
  await saveAccountConfig(email.trim());

  // Init directories
  await initAccountDirs(email.trim());
  console.log("  ✓ Directory structure created");

  // Test sync
  const doSync = await ask("\n  Run a test sync? (50 most recent messages from [Gmail]/All Mail) [Y/n]: ");
  if (doSync.toLowerCase() !== "n") {
    console.log("\n  Syncing from [Gmail]/All Mail (last 30 days, up to 50 messages)...");
    const syncClient = new ImapClient({ email: email.trim(), appPassword: cleanPassword });

    const result = await imapFullSync(syncClient, {
      email: email.trim(),
      depthDays: 30,
      maxMessages: 50,
      onProgress: (done, total) => {
        process.stdout.write(`\r  Progress: ${done}/${total} threads`);
      },
    });

    if (result.threadCount === 0) {
      console.log("\n  No messages found. This could mean:");
      console.log("    - No messages in the last 30 days");
      console.log("    - The [Gmail]/All Mail folder name differs (non-English Gmail)");
      console.log("  You can try running the daemon manually with a longer depth.");
    } else {
      console.log(`\n  ✓ Sync complete! ${result.threadCount} threads synced.`);
      printDataLocations(email.trim());
    }
  }
}

// ── OAuth Setup ─────────────────────────────────────────────────────

async function setupOAuth() {
  console.log("");
  console.log("  ┌─ Gmail OAuth Setup ──────────────────────────────┐");
  console.log("  │                                                   │");
  console.log("  │  1. Go to console.cloud.google.com/apis/credentials│");
  console.log("  │  2. Create a project (or use existing)            │");
  console.log("  │  3. Enable the Gmail API                          │");
  console.log("  │  4. Create OAuth 2.0 Client ID (Desktop app)     │");
  console.log("  │  5. Add redirect URI:                             │");
  console.log("  │     http://localhost:34567/oauth/callback          │");
  console.log("  │  6. Copy Client ID and Client Secret              │");
  console.log("  │                                                   │");
  console.log("  └───────────────────────────────────────────────────┘");
  console.log("");

  let creds = await getClientCredentials();
  if (creds) {
    console.log(`  Found existing OAuth client (${creds.clientId.slice(0, 20)}...)`);
    const reuse = await ask("  Use these? [Y/n]: ");
    if (reuse.toLowerCase() === "n") creds = null;
  }

  if (!creds) {
    const clientId = await ask("  Client ID: ");
    const clientSecret = await askHidden("  Client Secret: ");

    if (!clientId.trim() || !clientSecret.trim()) {
      console.error("  Both client_id and client_secret are required.");
      return;
    }

    await storeClientCredentials(clientId.trim(), clientSecret.trim());
    console.log("  ✓ Client credentials stored in OS keychain.\n");
  }

  // Import OAuth modules
  const { getAuthUrl, createOAuth2Client } = await import("../sync/oauth.js");
  const { storeTokens } = await import("../sync/keychain.js");

  console.log("  Starting OAuth flow...");
  const authUrl = await getAuthUrl();

  console.log("\n  Open this URL in your browser:\n");
  console.log(`  ${authUrl}\n`);

  const code = await waitForOAuthRedirect();
  console.log("\n  ✓ Authorization code received.");

  const oauth2Client = await createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    console.error("  Token exchange failed.");
    return;
  }

  // Get email from profile
  oauth2Client.setCredentials(tokens);
  const { google } = await import("googleapis");
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress!;

  console.log(`  ✓ Authenticated as: ${email}`);

  await storeTokens(email, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? Date.now() + 3600_000,
  });
  console.log("  ✓ Tokens stored in OS keychain.\n");

  await saveAccountConfig(email);
  await initAccountDirs(email);
  console.log("  ✓ Directory structure created");

  const doSync = await ask("\n  Run a test sync? (10 recent threads) [Y/n]: ");
  if (doSync.toLowerCase() !== "n") {
    const { getAuthenticatedClient } = await import("../sync/oauth.js");
    const { GmailClient } = await import("../sync/gmail-client.js");
    const { fullSync } = await import("../sync/full-sync.js");

    console.log("\n  Syncing...");
    const auth = await getAuthenticatedClient(email);
    const client = new GmailClient(auth, email);

    await fullSync(client, {
      email,
      depthDays: 7,
      maxThreads: 10,
      onProgress: (done, total) => {
        process.stdout.write(`\r  Progress: ${done}/${total} threads`);
      },
    });

    console.log("\n  ✓ Sync complete!");
    printDataLocations(email);
  }
}

// ── Shared helpers ──────────────────────────────────────────────────

async function askSendMode(): Promise<boolean> {
  console.log("");
  console.log("  Send mode:");
  console.log("    1. Auto-send (emails send immediately)");
  console.log("    2. Require approval (drafts wait in outbox)");
  console.log("");
  const choice = await ask("  Choose [2]: ");
  return choice.trim() !== "1"; // default = require approval (true)
}

async function saveAccountConfig(email: string): Promise<void> {
  let config: AppConfig;
  try {
    const raw = await readFile(configPath(), "utf-8");
    config = JSON.parse(raw);
    if (!config.accounts.includes(email)) {
      config.accounts.push(email);
    }
  } catch {
    config = {
      review_before_send: DEFAULTS.reviewBeforeSend,
      accounts: [email],
    };
  }

  // Ask send mode preference
  config.review_before_send = await askSendMode();

  await atomicWriteJson(configPath(), config);
  console.log(`  ✓ Config saved to ~/.maildeck/config.json`);
  console.log(`    Send mode: ${config.review_before_send ? "require approval" : "auto-send"}`);

  // Save account metadata
  const accountMeta: AccountMeta = {
    email,
    sync_state: "idle",
    last_sync: null,
    history_id: null,
    last_uid: null,
    sync_depth_days: DEFAULTS.syncDepthDays,
    poll_interval_seconds: DEFAULTS.pollIntervalSeconds,
  };
  await atomicWriteJson(accountMetaPath(email), accountMeta);

  // Prompt for optional email signature
  await askSignature(email);
}

async function askSignature(email: string): Promise<void> {
  console.log("");
  const sig = await ask("  Email signature (optional, press Enter to skip): ");
  if (sig.trim()) {
    await writeFile(signaturePath(email), sig.trim(), "utf-8");
    console.log("  ✓ Signature saved");
  }
}

function printDataLocations(email: string) {
  console.log(`\n  Your email is now at: ~/.maildeck/accounts/${email}/`);
  console.log("    Index:    index/threads.jsonl");
  console.log("    Threads:  threads/<id>/messages/*.md");
  console.log("    Contacts: index/contacts.jsonl");
  console.log("");
}

function waitForOAuthRedirect(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:34567`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h2>OAuth Error: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>✓ MailDeck authorized!</h2><p>You can close this tab and return to the terminal.</p>");
        server.close();
        resolve(code);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(34567, () => {
      console.log("  Waiting for OAuth redirect on http://localhost:34567 ...");
    });

    setTimeout(() => {
      server.close();
      reject(new Error("OAuth flow timed out (5 minutes)"));
    }, 300_000);
  });
}

main().catch((err) => {
  console.error(`\n  Setup failed: ${err.message}`);
  process.exit(1);
});
