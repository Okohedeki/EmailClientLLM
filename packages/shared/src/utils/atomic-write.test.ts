import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWriteFile, atomicWriteJson } from "./atomic-write.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "maildeck-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("atomicWriteFile", () => {
  it("writes content to file", async () => {
    const filePath = join(tempDir, "test.txt");
    await atomicWriteFile(filePath, "hello world");
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("hello world");
  });

  it("creates parent directories", async () => {
    const filePath = join(tempDir, "a", "b", "test.txt");
    await atomicWriteFile(filePath, "nested");
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("nested");
  });

  it("overwrites existing file", async () => {
    const filePath = join(tempDir, "test.txt");
    await atomicWriteFile(filePath, "first");
    await atomicWriteFile(filePath, "second");
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("second");
  });
});

describe("atomicWriteJson", () => {
  it("writes JSON with formatting", async () => {
    const filePath = join(tempDir, "data.json");
    await atomicWriteJson(filePath, { name: "test", value: 42 });
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({ name: "test", value: 42 });
  });
});
