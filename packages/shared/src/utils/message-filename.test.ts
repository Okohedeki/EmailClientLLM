import { describe, it, expect } from "vitest";
import { messageFilename, parseMessageFilename } from "./message-filename.js";

describe("messageFilename", () => {
  it("generates correct filename format", () => {
    const date = new Date("2026-02-17T09:30:00Z");
    const result = messageFilename(date, "18d4a7f2b3c1e001_005");
    expect(result).toBe("20260217T093000Z__msg18d4a7f2b3c1e001_005.md");
  });

  it("pads single-digit months and days", () => {
    const date = new Date("2026-01-05T01:02:03Z");
    const result = messageFilename(date, "abc123");
    expect(result).toBe("20260105T010203Z__msgabc123.md");
  });
});

describe("parseMessageFilename", () => {
  it("parses a valid filename", () => {
    const result = parseMessageFilename(
      "20260217T093000Z__msg18d4a7f2b3c1e001_005.md"
    );
    expect(result).not.toBeNull();
    expect(result!.date.toISOString()).toBe("2026-02-17T09:30:00.000Z");
    expect(result!.gmailMessageId).toBe("18d4a7f2b3c1e001_005");
  });

  it("returns null for invalid filename", () => {
    expect(parseMessageFilename("random.md")).toBeNull();
    expect(parseMessageFilename("")).toBeNull();
    expect(parseMessageFilename("001.md")).toBeNull();
  });

  it("roundtrips correctly", () => {
    const date = new Date("2026-06-15T22:45:10Z");
    const msgId = "xyz789_002";
    const filename = messageFilename(date, msgId);
    const parsed = parseMessageFilename(filename);

    expect(parsed).not.toBeNull();
    expect(parsed!.date.getTime()).toBe(date.getTime());
    expect(parsed!.gmailMessageId).toBe(msgId);
  });
});
