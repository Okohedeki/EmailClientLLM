/**
 * Strip email signatures and corporate disclaimers.
 *
 * Conservative: if stripping would remove >80% of the content,
 * return the original text instead.
 */
export function stripSignature(text: string): string {
  const lines = text.split("\n");
  let cutIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Standard signature separators
    if (line === "--" || line === "-- " || line === "__") {
      cutIndex = i;
      break;
    }

    // "Sent from" patterns
    if (/^sent from (my )?(iphone|ipad|android|galaxy|samsung|pixel|outlook|mobile)/i.test(line)) {
      cutIndex = i;
      break;
    }

    // "Get Outlook for" patterns
    if (/^get outlook for/i.test(line)) {
      cutIndex = i;
      break;
    }

    // Corporate disclaimer patterns (long legal text blocks)
    if (/^(this email|this message|this communication|confidentiality notice|disclaimer)/i.test(line) &&
        line.length > 80) {
      cutIndex = i;
      break;
    }

    // CONFIDENTIAL / DISCLAIMER all-caps headers
    if (/^(CONFIDENTIAL|DISCLAIMER|LEGAL NOTICE|IMPORTANT NOTICE)/.test(line)) {
      cutIndex = i;
      break;
    }
  }

  const stripped = lines.slice(0, cutIndex).join("\n").trim();

  // Conservative fallback: if we removed too much, keep original
  if (stripped.length < text.trim().length * 0.2 && text.trim().length > 50) {
    return text.trim();
  }

  return stripped;
}
