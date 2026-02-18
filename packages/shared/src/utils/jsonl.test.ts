import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readJsonl, writeJsonl, upsertJsonl } from "./jsonl.js";

interface TestRecord {
  id: string;
  name: string;
  value: number;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "maildeck-jsonl-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("readJsonl", () => {
  it("returns empty array for non-existent file", async () => {
    const result = await readJsonl(join(tempDir, "nope.jsonl"));
    expect(result).toEqual([]);
  });
});

describe("writeJsonl + readJsonl roundtrip", () => {
  it("writes and reads back items", async () => {
    const filePath = join(tempDir, "test.jsonl");
    const items: TestRecord[] = [
      { id: "1", name: "alice", value: 10 },
      { id: "2", name: "bob", value: 20 },
    ];

    await writeJsonl(filePath, items);
    const result = await readJsonl<TestRecord>(filePath);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(items[0]);
    expect(result[1]).toEqual(items[1]);
  });
});

describe("upsertJsonl", () => {
  it("appends new item when key not found", async () => {
    const filePath = join(tempDir, "upsert.jsonl");
    const item: TestRecord = { id: "1", name: "alice", value: 10 };

    const result = await upsertJsonl(filePath, item, "id");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(item);
  });

  it("replaces existing item when key matches", async () => {
    const filePath = join(tempDir, "upsert.jsonl");
    await writeJsonl(filePath, [
      { id: "1", name: "alice", value: 10 },
      { id: "2", name: "bob", value: 20 },
    ]);

    const updated: TestRecord = { id: "1", name: "alice-updated", value: 99 };
    const result = await upsertJsonl(filePath, updated, "id");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(updated);
    expect(result[1]).toEqual({ id: "2", name: "bob", value: 20 });
  });

  it("preserves order of other items on upsert", async () => {
    const filePath = join(tempDir, "upsert.jsonl");
    const items: TestRecord[] = [
      { id: "a", name: "first", value: 1 },
      { id: "b", name: "second", value: 2 },
      { id: "c", name: "third", value: 3 },
    ];
    await writeJsonl(filePath, items);

    await upsertJsonl(filePath, { id: "b", name: "updated", value: 22 }, "id");
    const result = await readJsonl<TestRecord>(filePath);

    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result[1].name).toBe("updated");
  });
});
