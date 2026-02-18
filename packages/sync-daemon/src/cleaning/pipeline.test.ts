import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanEmail } from "./pipeline.js";
import { parseMime } from "./mime-parser.js";
import { htmlToCleanText } from "./html-to-text.js";
import { stripQuotes } from "./quote-stripper.js";
import { stripSignature } from "./signature-stripper.js";
import { normalizeNoise } from "./noise-normalizer.js";
import { generateSnippet } from "./snippet-generator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFile(join(__dirname, "__fixtures__", name), "utf-8");

// ── MIME Parser ─────────────────────────────────────────────────────

describe("parseMime", () => {
  it("parses a simple text email", async () => {
    const raw = await fixture("simple-text.eml");
    const parsed = await parseMime(raw);

    expect(parsed.from?.address).toBe("mike@acme.com");
    expect(parsed.from?.name).toBe("Mike Chen");
    expect(parsed.to).toContain("you@gmail.com");
    expect(parsed.subject).toBe("Johnson deal pricing");
    expect(parsed.messageId).toBe("<CAK7abc123@mail.gmail.com>");
    expect(parsed.textBody).toContain("implementation fees");
    expect(parsed.htmlBody).toBeUndefined();
    expect(parsed.attachments).toHaveLength(0);
  });

  it("parses an HTML-only email", async () => {
    const raw = await fixture("html-only.eml");
    const parsed = await parseMime(raw);

    expect(parsed.from?.address).toBe("sarah@company.com");
    // mailparser auto-generates textBody from HTML, so just check HTML is present
    expect(parsed.htmlBody).toContain("<strong>Alice:</strong>");
  });

  it("parses reply headers", async () => {
    const raw = await fixture("reply-with-quotes.eml");
    const parsed = await parseMime(raw);

    expect(parsed.inReplyTo).toBe("<CAK7abc123@mail.gmail.com>");
    expect(parsed.references).toContain("<CAK7abc123@mail.gmail.com>");
  });
});

// ── HTML to Text ────────────────────────────────────────────────────

describe("htmlToCleanText", () => {
  it("converts HTML to readable plain text", () => {
    const html = "<p>Hello <strong>world</strong></p><ul><li>Item 1</li><li>Item 2</li></ul>";
    const text = htmlToCleanText(html);

    expect(text).toContain("Hello world");
    expect(text).toContain("Item 1");
    expect(text).toContain("Item 2");
  });

  it("strips tracking images", () => {
    const html = '<p>Content</p><img src="https://tracking.example.com/pixel.gif" />';
    const text = htmlToCleanText(html);

    expect(text).toContain("Content");
    expect(text).not.toContain("tracking");
    expect(text).not.toContain("pixel");
  });
});

// ── Quote Stripper ──────────────────────────────────────────────────

describe("stripQuotes", () => {
  it("removes quoted reply chains", () => {
    const text = `That sounds reasonable. Let's go with the revised numbers.

Can we schedule a call Thursday to finalize?

On Mon, Feb 17, 2026 at 9:30 AM You <you@gmail.com> wrote:
> How about we split the implementation into two phases?
> Phase 1 at $8K and Phase 2 at $5K?`;

    const stripped = stripQuotes(text);

    expect(stripped).toContain("That sounds reasonable");
    expect(stripped).toContain("schedule a call Thursday");
    expect(stripped).not.toContain("How about we split");
  });

  it("preserves short messages without quotes", () => {
    const text = "Thanks, got it!";
    expect(stripQuotes(text)).toBe("Thanks, got it!");
  });
});

// ── Signature Stripper ──────────────────────────────────────────────

describe("stripSignature", () => {
  it("strips standard -- separator signatures", () => {
    const text = `Please review the contract.

--
John Smith
Senior Legal Counsel`;

    const stripped = stripSignature(text);
    expect(stripped).toContain("Please review");
    expect(stripped).not.toContain("John Smith");
    expect(stripped).not.toContain("Legal Counsel");
  });

  it("strips Sent from my iPhone", () => {
    const text = "Can you send me the report?\n\nSent from my iPhone";
    const stripped = stripSignature(text);

    expect(stripped).toContain("send me the report");
    expect(stripped).not.toContain("iPhone");
  });

  it("preserves content when stripping would remove too much", () => {
    // If the "signature" IS the whole message, keep it
    const text = "Sent from my iPhone but this is actually important context and more text follows here to make the message longer than the threshold";
    const stripped = stripSignature(text);
    expect(stripped.length).toBeGreaterThan(10);
  });
});

// ── Noise Normalizer ────────────────────────────────────────────────

describe("normalizeNoise", () => {
  it("collapses excessive blank lines", () => {
    const text = "Hello\n\n\n\n\nWorld";
    expect(normalizeNoise(text)).toBe("Hello\n\nWorld");
  });

  it("strips UTM params from URLs", () => {
    const text = "Visit https://example.com/page?utm_source=email&utm_medium=link&id=42";
    const result = normalizeNoise(text);

    expect(result).toContain("https://example.com/page");
    expect(result).toContain("id=42");
    expect(result).not.toContain("utm_source");
    expect(result).not.toContain("utm_medium");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeNoise("  hello  ")).toBe("hello");
  });
});

// ── Snippet Generator ───────────────────────────────────────────────

describe("generateSnippet", () => {
  it("returns full text for short messages", () => {
    expect(generateSnippet("Short message")).toBe("Short message");
  });

  it("truncates long text at word boundary", () => {
    const longText = "word ".repeat(100);
    const snippet = generateSnippet(longText, 50);

    expect(snippet.length).toBeLessThanOrEqual(54); // 50 + "..."
    expect(snippet).toMatch(/\.\.\.$/);
  });

  it("collapses internal whitespace", () => {
    const text = "Hello\n\n  world\n\nfoo";
    const snippet = generateSnippet(text);
    expect(snippet).toBe("Hello world foo");
  });
});

// ── Full Pipeline ───────────────────────────────────────────────────

describe("cleanEmail (full pipeline)", () => {
  it("cleans a simple text email", async () => {
    const raw = await fixture("simple-text.eml");
    const result = await cleanEmail(raw, "thread_001", "msg001");

    expect(result.frontmatter.from).toBe("mike@acme.com");
    expect(result.frontmatter.from_name).toBe("Mike Chen");
    expect(result.frontmatter.thread_id).toBe("thread_001");
    expect(result.frontmatter.gmail_message_id).toBe("msg001");
    expect(result.body).toContain("implementation fees");
    expect(result.snippet.length).toBeGreaterThan(0);
    expect(result.attachments).toHaveLength(0);
  });

  it("cleans an HTML-only email", async () => {
    const raw = await fixture("html-only.eml");
    const result = await cleanEmail(raw, "thread_002", "msg002");

    expect(result.frontmatter.from).toBe("sarah@company.com");
    expect(result.body).toContain("standup notes");
    expect(result.body).toContain("Alice");
    // Should not contain HTML tags
    expect(result.body).not.toContain("<strong>");
    expect(result.body).not.toContain("<li>");
    // UTM params should be stripped
    expect(result.body).not.toContain("utm_source");
  });

  it("strips quotes from reply emails", async () => {
    const raw = await fixture("reply-with-quotes.eml");
    const result = await cleanEmail(raw, "thread_001", "msg003");

    expect(result.body).toContain("That sounds reasonable");
    expect(result.body).toContain("schedule a call Thursday");
    // Quoted content should be removed
    expect(result.body).not.toContain("How about we split");
    // Headers preserved in frontmatter
    expect(result.frontmatter.in_reply_to).toBe("<CAK7abc123@mail.gmail.com>");
  });

  it("strips signatures", async () => {
    const raw = await fixture("with-signature.eml");
    const result = await cleanEmail(raw, "thread_003", "msg004");

    expect(result.body).toContain("updated contract");
    expect(result.body).not.toContain("Senior Legal Counsel");
    expect(result.body).not.toContain("CONFIDENTIAL");
  });

  it("strips mobile sent-from footers", async () => {
    const raw = await fixture("sent-from-mobile.eml");
    const result = await cleanEmail(raw, "thread_004", "msg005");

    expect(result.body).toContain("sales report");
    expect(result.body).not.toContain("Sent from my iPhone");
  });
});
