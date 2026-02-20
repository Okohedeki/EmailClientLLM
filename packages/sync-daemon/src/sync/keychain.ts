import keytar from "keytar";

const SERVICE_NAME = "clawmail3";

// ── App Password (IMAP/SMTP) ───────────────────────────────────────

/**
 * Store an app password for IMAP/SMTP auth.
 */
export async function storeAppPassword(
  email: string,
  appPassword: string
): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, `imap:${email}`, appPassword);
}

/**
 * Retrieve the stored app password for an account.
 */
export async function getAppPassword(email: string): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, `imap:${email}`);
}

/**
 * Delete stored app password.
 */
export async function deleteAppPassword(email: string): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, `imap:${email}`);
}

// ── OAuth tokens ────────────────────────────────────────────────────

/**
 * Store OAuth tokens in the OS credential manager.
 */
export async function storeTokens(
  email: string,
  tokens: { access_token: string; refresh_token: string; expiry_date: number }
): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, `oauth:${email}`, JSON.stringify(tokens));
}

/**
 * Retrieve stored OAuth tokens for an account.
 */
export async function getTokens(
  email: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expiry_date: number;
} | null> {
  const raw = await keytar.getPassword(SERVICE_NAME, `oauth:${email}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Delete stored OAuth tokens for an account.
 */
export async function deleteTokens(email: string): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, `oauth:${email}`);
}

// ── OAuth client credentials ────────────────────────────────────────

/**
 * Store the OAuth client credentials (client_id + client_secret).
 */
export async function storeClientCredentials(
  clientId: string,
  clientSecret: string
): Promise<void> {
  await keytar.setPassword(
    SERVICE_NAME,
    "__client_credentials__",
    JSON.stringify({ clientId, clientSecret })
  );
}

/**
 * Retrieve the OAuth client credentials.
 */
export async function getClientCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const raw = await keytar.getPassword(SERVICE_NAME, "__client_credentials__");
  if (!raw) return null;
  return JSON.parse(raw);
}

// ── Cleanup ─────────────────────────────────────────────────────────

/**
 * Delete all stored credentials for an account.
 */
export async function deleteAllCredentials(email: string): Promise<void> {
  await deleteAppPassword(email).catch(() => {});
  await deleteTokens(email).catch(() => {});
}
