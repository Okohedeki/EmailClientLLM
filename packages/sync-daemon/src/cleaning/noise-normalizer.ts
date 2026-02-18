/**
 * Normalize whitespace noise and clean up tracking artifacts.
 *
 * - Strip image reference lines ([image: ...] and bare image URLs)
 * - Strip/collapse tracking URLs (long encoded tokens)
 * - Strip email footer boilerplate (unsubscribe, addresses, "intended for")
 * - Strip UTM params from URLs
 * - Collapse >2 consecutive blank lines to max 2
 * - Trim leading/trailing whitespace
 * - Normalize Unicode to NFC
 */
export function normalizeNoise(text: string): string {
  let result = text;

  // Normalize Unicode to NFC
  result = result.normalize("NFC");

  // Normalize smart quotes to straight quotes (for consistent matching)
  result = result.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  result = result.replace(/[\u201C\u201D\u201E\u201F]/g, '"');

  // Remove lines that are just image references: [image: Google] or [https://...image.png]
  result = result.replace(/^\[image:[^\]]*\]$/gm, "");
  result = result.replace(/^\[https?:\/\/[^\]]*\.(?:png|jpg|jpeg|gif|svg|ico|webp)[^\]]*\].*$/gm, "");

  // Remove lines that are just a bare image URL (no surrounding text)
  result = result.replace(/^https?:\/\/\S+\.(?:png|jpg|jpeg|gif|svg|ico|webp)\S*$/gm, "");

  // Remove tracking-heavy URLs: lines that are ONLY a URL with long path/tokens (>120 chars)
  result = result.replace(/^(https?:\/\/\S{120,})$/gm, "");

  // For inline tracking URLs: shorten URLs with excessively long tracking tokens
  // Replace URLs > 150 chars with just the domain + path start
  result = result.replace(
    /(\bhttps?:\/\/[^\s)]+)/g,
    (url) => {
      const cleaned = stripUtmParams(url);
      if (cleaned.length > 150) {
        return shortenUrl(cleaned);
      }
      return cleaned;
    }
  );

  // Strip common email footer patterns
  result = stripFooter(result);

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
      if (
        key.startsWith("utm_") ||
        key === "correlation_id" ||
        key === "ref_campaign" ||
        key === "ref_source" ||
        key === "token" ||
        key === "auto_token" ||
        key === "ct" ||
        key === "ec"
      ) {
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

/** Shorten a URL to domain + first path segment */
function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const shortPath = pathParts.length > 0 ? `/${pathParts[0]}/...` : "";
    return `${parsed.origin}${shortPath}`;
  } catch {
    return url.slice(0, 80) + "...";
  }
}

/** Strip common email footer boilerplate */
function stripFooter(text: string): string {
  const lines = text.split("\n");

  // Strategy 1: Find a known footer boundary marker (scan forward from halfway)
  const halfwayPoint = Math.floor(lines.length * 0.4);
  for (let i = halfwayPoint; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    if (isFooterBoundary(line)) {
      const stripped = lines.slice(0, i).join("\n").trim();
      // Don't cut if we'd lose too much
      if (stripped.length > text.trim().length * 0.2) {
        return stripped;
      }
    }
  }

  // Strategy 2: Walk backwards from bottom trimming footer lines
  let cutIndex = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim().toLowerCase();
    if (line === "" || isFooterLine(line)) {
      cutIndex = i;
      continue;
    }
    break;
  }

  if (cutIndex < lines.length && cutIndex > lines.length * 0.4) {
    return lines.slice(0, cutIndex).join("\n");
  }

  return text;
}

/** Lines that signal the start of a footer section */
function isFooterBoundary(line: string): boolean {
  return (
    /^you'?re (getting|receiving) this (email|message) because/.test(line) ||
    /^this (email|message) was (sent|intended) (to|for)/.test(line) ||
    /^if you no longer (wish|want) to receive/.test(line) ||
    /^to (unsubscribe|stop receiving|opt.?out)/.test(line) ||
    /^not interested in emails like this/.test(line) ||
    /^manage your (email )?preferences/.test(line) ||
    /^you can unsubscribe/.test(line) ||
    /^-{5,}$/.test(line) ||
    /^to unsubscribe,/.test(line)
  );
}

function isFooterLine(line: string): boolean {
  return (
    // Unsubscribe patterns
    /\bunsubscribe\b/.test(line) ||
    // "Stop receiving" / "Not interested" / "Opt out"
    /\b(stop receiving|not interested|opt.?out|email preferences)\b/.test(line) ||
    // "This email/message was intended for"
    /^this (email|message) was intended for/.test(line) ||
    // "You're getting this email because"
    /^you'?re (getting|receiving) this (email|message)/.test(line) ||
    // Lines that are just a URL in angle brackets: <https://...>
    /^<https?:\/\/[^>]+>$/.test(line) ||
    // Lines that are just a bare URL (no text around it)
    /^https?:\/\/\S+$/.test(line) ||
    // "Manage your preferences/settings"
    /\bmanage your (preferences|settings)\b/.test(line) ||
    // Social media link lines (very short lines with just a social URL)
    /\b(linkedin|instagram|twitter|facebook|youtube)\b/.test(line) && line.length < 80 ||
    // "All rights reserved"
    /all rights reserved/.test(line) ||
    // Physical address patterns (city, state zip)
    /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/i.test(line) && line.length < 100 ||
    // "You received this email"
    /^you received this (email|message)/.test(line) ||
    // Copyright notices
    /^©\s*\d{4}/.test(line) ||
    // "To manage" / "manage your" email preferences
    /\bmanage\b.*\b(email|notification|preference|subscription)/.test(line) ||
    // "View in browser" / "View this email"
    /^view (this )?(email|in browser|in your browser)/.test(line) ||
    // Lines that are just dashes (separators)
    /^-{3,}$/.test(line) ||
    // "Powered by" lines
    /^powered by\b/.test(line) ||
    // Lines that are just "from <service> marketing messages"
    /\bmarketing messages?\b/.test(line)
  );
}
