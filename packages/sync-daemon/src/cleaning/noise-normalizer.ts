/**
 * Normalize whitespace noise and clean up tracking artifacts.
 *
 * - Collapse >2 consecutive blank lines to max 2
 * - Trim leading/trailing whitespace
 * - Strip UTM params from URLs
 * - Normalize Unicode to NFC
 */
export function normalizeNoise(text: string): string {
  let result = text;

  // Normalize Unicode to NFC
  result = result.normalize("NFC");

  // Strip UTM tracking params from URLs
  result = result.replace(
    /(\bhttps?:\/\/[^\s)]+)/g,
    (url) => stripUtmParams(url)
  );

  // Collapse >2 consecutive blank lines to 2
  result = result.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
}

function stripUtmParams(url: string): string {
  try {
    const parsed = new URL(url);
    const keysToDelete: string[] = [];
    for (const key of parsed.searchParams.keys()) {
      if (key.startsWith("utm_")) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }
    // Remove trailing ? if no params left
    let result = parsed.toString();
    if (result.endsWith("?")) {
      result = result.slice(0, -1);
    }
    return result;
  } catch {
    return url;
  }
}
