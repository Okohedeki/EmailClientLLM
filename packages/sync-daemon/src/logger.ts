import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logsDir } from "@maildeck/shared";

let logDir: string | null = null;

/**
 * Initialize the logger with the base directory.
 */
export async function initLogger(base?: string): Promise<void> {
  logDir = logsDir(base);
  await mkdir(logDir, { recursive: true });
}

/**
 * Append a timestamped log entry to sync.log.
 */
export async function log(
  level: "info" | "warn" | "error",
  message: string
): Promise<void> {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${message}\n`;

  // Also log to console
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }

  // Write to file if logger initialized
  if (logDir) {
    await appendFile(join(logDir, "sync.log"), line).catch(() => {
      // Swallow file write errors — don't crash the daemon over logging
    });
  }
}
