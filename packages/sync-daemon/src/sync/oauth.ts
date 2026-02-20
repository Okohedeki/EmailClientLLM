import { google } from "googleapis";
import { storeTokens, getTokens, getClientCredentials } from "./keychain.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

const REDIRECT_URI = "http://localhost:34567/oauth/callback";

/**
 * Create an OAuth2 client from stored client credentials.
 */
export async function createOAuth2Client() {
  const creds = await getClientCredentials();
  if (!creds) {
    throw new Error(
      "No OAuth client credentials found. Run setup first to store client_id and client_secret."
    );
  }

  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT_URI);
}

/**
 * Generate the OAuth consent URL for a user to authorize ClawMail3.
 */
export async function getAuthUrl(): Promise<string> {
  const client = await createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

/**
 * Exchange an authorization code for tokens and store them.
 */
export async function exchangeCode(
  code: string,
  email: string
): Promise<void> {
  const client = await createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("OAuth token exchange failed — missing tokens");
  }

  await storeTokens(email, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? Date.now() + 3600_000,
  });
}

/**
 * Get an authenticated OAuth2 client for a specific account.
 * Handles automatic token refresh.
 */
export async function getAuthenticatedClient(email: string) {
  const client = await createOAuth2Client();
  const tokens = await getTokens(email);

  if (!tokens) {
    throw new Error(`No stored tokens for ${email}. Run OAuth flow first.`);
  }

  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  // Listen for token refresh events and persist new tokens
  client.on("tokens", async (newTokens) => {
    await storeTokens(email, {
      access_token: newTokens.access_token ?? tokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expiry_date: newTokens.expiry_date ?? Date.now() + 3600_000,
    });
  });

  return client;
}
