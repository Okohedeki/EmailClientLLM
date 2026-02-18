import { describe, it, expect } from "vitest";
import {
  baseDir,
  configPath,
  accountDir,
  indexDir,
  threadsIndexPath,
  contactsIndexPath,
  threadDir,
  threadMetaPath,
  messagesDir,
  attachmentsDir,
  outboxDir,
  sentDir,
  failedDir,
  logsDir,
} from "./paths.js";

const TEST_BASE = "/tmp/maildeck-test";
const EMAIL = "user@gmail.com";
const THREAD = "18d4a7f2b3c1e001";

describe("paths", () => {
  it("baseDir uses override when provided", () => {
    expect(baseDir(TEST_BASE)).toBe(TEST_BASE);
  });

  it("configPath", () => {
    const p = configPath(TEST_BASE);
    expect(p).toContain("maildeck-test");
    expect(p).toMatch(/config\.json$/);
  });

  it("logsDir", () => {
    expect(logsDir(TEST_BASE)).toContain("logs");
  });

  it("accountDir", () => {
    const p = accountDir(EMAIL, TEST_BASE);
    expect(p).toContain("accounts");
    expect(p).toContain(EMAIL);
  });

  it("indexDir and index files", () => {
    expect(indexDir(EMAIL, TEST_BASE)).toContain("index");
    expect(threadsIndexPath(EMAIL, TEST_BASE)).toContain("threads.jsonl");
    expect(contactsIndexPath(EMAIL, TEST_BASE)).toContain("contacts.jsonl");
  });

  it("threadDir and children", () => {
    const td = threadDir(EMAIL, THREAD, TEST_BASE);
    expect(td).toContain(THREAD);
    expect(threadMetaPath(EMAIL, THREAD, TEST_BASE)).toContain("thread.json");
    expect(messagesDir(EMAIL, THREAD, TEST_BASE)).toContain("messages");
    expect(attachmentsDir(EMAIL, THREAD, TEST_BASE)).toContain("attachments");
  });

  it("outbox/sent/failed dirs", () => {
    expect(outboxDir(EMAIL, TEST_BASE)).toContain("outbox");
    expect(sentDir(EMAIL, TEST_BASE)).toContain("sent");
    expect(failedDir(EMAIL, TEST_BASE)).toContain("failed");
  });
});
