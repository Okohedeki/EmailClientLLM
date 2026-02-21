import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWriteJson, outboxDir, sentDir, failedDir } from "@maildeck/shared";
import { initAccountDirs } from "../storage/directory-init.js";
import { validateDraft, parseDraft } from "./validator.js";
import { transitionDraft, autoPromote, InvalidTransitionError } from "./state-machine.js";

const EMAIL = "test@gmail.com";
let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "maildeck-outbox-"));
  await initAccountDirs(EMAIL, base);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

// ── Validator ───────────────────────────────────────────────────────

describe("validateDraft", () => {
  it("accepts a valid reply draft", () => {
    const result = validateDraft({
      action: "reply",
      thread_id: "t1",
      to: ["mike@acme.com"],
      subject: "Re: Test",
      body: "Looks good!",
      status: "pending_review",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a valid compose draft", () => {
    const result = validateDraft({
      action: "compose",
      to: ["new@person.com"],
      subject: "Hello",
      body: "Hi there",
      status: "ready_to_send",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects non-object", () => {
    expect(validateDraft(null).valid).toBe(false);
    expect(validateDraft("string").valid).toBe(false);
  });

  it("rejects missing action", () => {
    const result = validateDraft({
      to: ["a@b.com"],
      subject: "Hi",
      body: "Yo",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("action");
  });

  it("rejects reply without thread_id", () => {
    const result = validateDraft({
      action: "reply",
      to: ["a@b.com"],
      subject: "Re: Hi",
      body: "Ok",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("thread_id"))).toBe(true);
  });

  it("rejects empty to array", () => {
    const result = validateDraft({
      action: "compose",
      to: [],
      subject: "Hi",
      body: "Test",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid email in to", () => {
    const result = validateDraft({
      action: "compose",
      to: ["not-an-email"],
      subject: "Hi",
      body: "Test",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid email");
  });

  it("rejects invalid status", () => {
    const result = validateDraft({
      action: "compose",
      to: ["a@b.com"],
      subject: "Hi",
      body: "Test",
      status: "bogus",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid status");
  });
});

describe("parseDraft", () => {
  it("returns typed draft on valid input", () => {
    const draft = parseDraft({
      action: "compose",
      to: ["a@b.com"],
      subject: "Hi",
      body: "Test",
      status: "pending_review",
    });
    expect(draft).not.toBeNull();
    expect(draft!.action).toBe("compose");
  });

  it("returns null on invalid input", () => {
    expect(parseDraft({})).toBeNull();
  });
});

// ── State Machine ───────────────────────────────────────────────────

describe("transitionDraft", () => {
  const writeDraft = async (filename: string, status: string) => {
    const filePath = join(outboxDir(EMAIL, base), filename);
    await atomicWriteJson(filePath, {
      action: "compose",
      to: ["a@b.com"],
      subject: "Test",
      body: "Hello",
      status,
      created_at: new Date().toISOString(),
      created_by: "agent",
    });
  };

  it("transitions pending_review → ready_to_send", async () => {
    await writeDraft("draft_001.json", "pending_review");
    await transitionDraft(EMAIL, "draft_001.json", "ready_to_send", undefined, base);

    const content = await readFile(
      join(outboxDir(EMAIL, base), "draft_001.json"),
      "utf-8"
    );
    expect(JSON.parse(content).status).toBe("ready_to_send");
  });

  it("transitions ready_to_send → sending", async () => {
    await writeDraft("draft_002.json", "ready_to_send");
    await transitionDraft(EMAIL, "draft_002.json", "sending", undefined, base);

    const content = await readFile(
      join(outboxDir(EMAIL, base), "draft_002.json"),
      "utf-8"
    );
    expect(JSON.parse(content).status).toBe("sending");
  });

  it("moves to sent/ on sending → sent", async () => {
    await writeDraft("draft_003.json", "sending");
    await transitionDraft(EMAIL, "draft_003.json", "sent", { gmail_message_id: "m1" }, base);

    // Should be in sent/, not outbox/
    const sentFiles = await readdir(sentDir(EMAIL, base));
    expect(sentFiles).toContain("draft_003.json");

    const outboxFiles = await readdir(outboxDir(EMAIL, base));
    expect(outboxFiles).not.toContain("draft_003.json");

    // Check metadata
    const content = await readFile(
      join(sentDir(EMAIL, base), "draft_003.json"),
      "utf-8"
    );
    const parsed = JSON.parse(content);
    expect(parsed.status).toBe("sent");
    expect(parsed.gmail_message_id).toBe("m1");
    expect(parsed.sent_at).toBeDefined();
  });

  it("moves to failed/ on sending → failed", async () => {
    await writeDraft("draft_004.json", "sending");
    await transitionDraft(EMAIL, "draft_004.json", "failed", { error: "API error" }, base);

    const failedFiles = await readdir(failedDir(EMAIL, base));
    expect(failedFiles).toContain("draft_004.json");

    const content = await readFile(
      join(failedDir(EMAIL, base), "draft_004.json"),
      "utf-8"
    );
    const parsed = JSON.parse(content);
    expect(parsed.status).toBe("failed");
    expect(parsed.error).toBe("API error");
  });

  it("rejects invalid transitions", async () => {
    await writeDraft("draft_005.json", "pending_review");

    await expect(
      transitionDraft(EMAIL, "draft_005.json", "sent", undefined, base)
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("rejects sent → anything", async () => {
    await writeDraft("draft_006.json", "pending_review");
    await transitionDraft(EMAIL, "draft_006.json", "ready_to_send", undefined, base);

    // Can't skip sending
    await expect(
      transitionDraft(EMAIL, "draft_006.json", "sent", undefined, base)
    ).rejects.toThrow(InvalidTransitionError);
  });
});

describe("autoPromote", () => {
  it("promotes pending_review to ready_to_send", async () => {
    const filePath = join(outboxDir(EMAIL, base), "auto.json");
    await atomicWriteJson(filePath, {
      action: "compose",
      to: ["a@b.com"],
      subject: "Test",
      body: "Hello",
      status: "pending_review",
      created_at: new Date().toISOString(),
      created_by: "agent",
    });

    await autoPromote(EMAIL, "auto.json", base);

    const content = await readFile(filePath, "utf-8");
    expect(JSON.parse(content).status).toBe("ready_to_send");
  });
});
