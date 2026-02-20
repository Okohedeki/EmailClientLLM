import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  accountDir,
  indexDir,
  outboxDir,
  sentDir,
  failedDir,
  logsDir,
  threadMetaPath,
  messagesDir,
  attachmentsDir,
  threadsIndexPath,
  contactsIndexPath,
  type ThreadMeta,
  type ThreadIndexEntry,
  type ContactEntry,
  type MessageFrontmatter,
} from "@clawmail3/shared";
import { initAccountDirs, initThreadDirs } from "./directory-init.js";
import { writeThreadMeta, writeMessage } from "./thread-writer.js";
import {
  upsertThreadIndex,
  upsertContactIndex,
  readThreadIndex,
  readContactIndex,
} from "./index-writer.js";
import { writeAttachments } from "./attachment-writer.js";

const EMAIL = "test@gmail.com";
const THREAD_ID = "18d4a7f2b3c1e001";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "maildeck-storage-"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

// ── Directory Init ──────────────────────────────────────────────────

describe("initAccountDirs", () => {
  it("creates full account directory tree", async () => {
    await initAccountDirs(EMAIL, base);

    const dirs = [
      indexDir(EMAIL, base),
      outboxDir(EMAIL, base),
      sentDir(EMAIL, base),
      failedDir(EMAIL, base),
      logsDir(base),
    ];

    for (const dir of dirs) {
      const s = await stat(dir);
      expect(s.isDirectory()).toBe(true);
    }
  });

  it("is idempotent", async () => {
    await initAccountDirs(EMAIL, base);
    await initAccountDirs(EMAIL, base); // no error
  });
});

describe("initThreadDirs", () => {
  it("creates messages/ and attachments/ dirs", async () => {
    await initThreadDirs(EMAIL, THREAD_ID, base);

    const msgDir = messagesDir(EMAIL, THREAD_ID, base);
    const attDir = attachmentsDir(EMAIL, THREAD_ID, base);

    expect((await stat(msgDir)).isDirectory()).toBe(true);
    expect((await stat(attDir)).isDirectory()).toBe(true);
  });
});

// ── Thread Writer ───────────────────────────────────────────────────

describe("writeThreadMeta", () => {
  it("writes thread.json", async () => {
    const meta: ThreadMeta = {
      id: THREAD_ID,
      subject: "Test thread",
      labels: ["INBOX"],
      unread: true,
      starred: false,
      participants: [
        { email: "sender@test.com", name: "Sender", role: "external" },
      ],
      message_count: 1,
      first_date: "2026-02-17T09:00:00Z",
      last_date: "2026-02-17T09:00:00Z",
      has_attachments: false,
      attachments: [],
    };

    await writeThreadMeta(EMAIL, meta, base);

    const content = await readFile(
      threadMetaPath(EMAIL, THREAD_ID, base),
      "utf-8"
    );
    const parsed = JSON.parse(content);
    expect(parsed.id).toBe(THREAD_ID);
    expect(parsed.subject).toBe("Test thread");
    expect(parsed.participants).toHaveLength(1);
  });
});

describe("writeMessage", () => {
  it("writes a .md file with YAML frontmatter", async () => {
    const frontmatter: MessageFrontmatter = {
      id: "msg_001",
      gmail_message_id: "001",
      thread_id: THREAD_ID,
      rfc822_message_id: "<test@mail.com>",
      from: "sender@test.com",
      from_name: "Sender",
      to: "you@gmail.com",
      date: "2026-02-17T09:30:00Z",
    };

    const filename = await writeMessage(
      EMAIL,
      THREAD_ID,
      frontmatter,
      "Hello, this is the message body.",
      base
    );

    expect(filename).toMatch(/^20260217T093000Z__msg001\.md$/);

    const filePath = join(messagesDir(EMAIL, THREAD_ID, base), filename);
    const content = await readFile(filePath, "utf-8");

    expect(content).toContain("---");
    expect(content).toContain("id: msg_001");
    expect(content).toContain("from: sender@test.com");
    expect(content).toContain("Hello, this is the message body.");
  });

  it("sorts multiple messages chronologically by filename", async () => {
    const dates = [
      "2026-02-17T14:00:00Z",
      "2026-02-17T09:00:00Z",
      "2026-02-17T11:00:00Z",
    ];

    for (let i = 0; i < dates.length; i++) {
      await writeMessage(
        EMAIL,
        THREAD_ID,
        {
          id: `msg_${i}`,
          gmail_message_id: `m${i}`,
          thread_id: THREAD_ID,
          from: "test@test.com",
          from_name: "Test",
          to: "you@gmail.com",
          date: dates[i],
        },
        `Message ${i}`,
        base
      );
    }

    const dir = messagesDir(EMAIL, THREAD_ID, base);
    const files = (await readdir(dir)).sort();

    // Should sort chronologically: 09:00, 11:00, 14:00
    expect(files[0]).toContain("T090000Z");
    expect(files[1]).toContain("T110000Z");
    expect(files[2]).toContain("T140000Z");
  });
});

// ── Index Writer ────────────────────────────────────────────────────

describe("upsertThreadIndex", () => {
  const makeEntry = (
    id: string,
    lastDate: string
  ): ThreadIndexEntry => ({
    id,
    subject: `Thread ${id}`,
    from: "test@test.com",
    from_name: "Test",
    participants: ["test@test.com"],
    labels: ["INBOX"],
    unread: true,
    starred: false,
    msg_count: 1,
    last_date: lastDate,
    first_date: lastDate,
    snippet: "Test snippet",
    has_attachments: false,
    size_bytes: 100,
  });

  it("creates index and inserts entry", async () => {
    await initAccountDirs(EMAIL, base);
    await upsertThreadIndex(EMAIL, makeEntry("t1", "2026-02-17T09:00:00Z"), base);

    const entries = await readThreadIndex(EMAIL, base);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("t1");
  });

  it("upserts existing entry", async () => {
    await initAccountDirs(EMAIL, base);
    await upsertThreadIndex(EMAIL, makeEntry("t1", "2026-02-17T09:00:00Z"), base);

    const updated = makeEntry("t1", "2026-02-18T09:00:00Z");
    updated.msg_count = 5;
    await upsertThreadIndex(EMAIL, updated, base);

    const entries = await readThreadIndex(EMAIL, base);
    expect(entries).toHaveLength(1);
    expect(entries[0].msg_count).toBe(5);
  });

  it("sorts newest-first", async () => {
    await initAccountDirs(EMAIL, base);
    await upsertThreadIndex(EMAIL, makeEntry("old", "2026-02-10T00:00:00Z"), base);
    await upsertThreadIndex(EMAIL, makeEntry("new", "2026-02-20T00:00:00Z"), base);
    await upsertThreadIndex(EMAIL, makeEntry("mid", "2026-02-15T00:00:00Z"), base);

    const entries = await readThreadIndex(EMAIL, base);
    expect(entries.map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });
});

describe("upsertContactIndex", () => {
  it("creates and upserts contacts", async () => {
    await initAccountDirs(EMAIL, base);

    const contact: ContactEntry = {
      email: "mike@acme.com",
      name: "Mike Chen",
      first_seen: "2024-06-15",
      last_seen: "2026-02-17",
      msg_count: 1,
      labels_common: ["INBOX"],
      is_frequent: false,
    };

    await upsertContactIndex(EMAIL, contact, base);
    let contacts = await readContactIndex(EMAIL, base);
    expect(contacts).toHaveLength(1);

    // Update
    contact.msg_count = 42;
    contact.is_frequent = true;
    await upsertContactIndex(EMAIL, contact, base);
    contacts = await readContactIndex(EMAIL, base);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].msg_count).toBe(42);
    expect(contacts[0].is_frequent).toBe(true);
  });
});

// ── Attachment Writer ───────────────────────────────────────────────

describe("writeAttachments", () => {
  it("writes attachments to thread attachments dir", async () => {
    const attachments = [
      {
        filename: "report.pdf",
        contentType: "application/pdf",
        content: Buffer.from("fake pdf content"),
        size: 16,
      },
      {
        filename: "image.png",
        contentType: "image/png",
        content: Buffer.from("fake png"),
        size: 8,
      },
    ];

    const results = await writeAttachments(EMAIL, THREAD_ID, attachments, base);

    expect(results).toHaveLength(2);
    expect(results[0].filename).toBe("report.pdf");
    expect(results[1].filename).toBe("image.png");

    const dir = attachmentsDir(EMAIL, THREAD_ID, base);
    const files = await readdir(dir);
    expect(files).toContain("report.pdf");
    expect(files).toContain("image.png");

    // Verify content
    const pdfContent = await readFile(join(dir, "report.pdf"), "utf-8");
    expect(pdfContent).toBe("fake pdf content");
  });

  it("sanitizes dangerous filenames", async () => {
    const attachments = [
      {
        filename: "../../../etc/passwd",
        contentType: "text/plain",
        content: Buffer.from("nope"),
        size: 4,
      },
    ];

    const results = await writeAttachments(EMAIL, THREAD_ID, attachments, base);
    expect(results[0].filename).not.toContain("..");
    expect(results[0].filename).not.toContain("/");
  });

  it("returns empty array for no attachments", async () => {
    const results = await writeAttachments(EMAIL, THREAD_ID, [], base);
    expect(results).toEqual([]);
  });
});
