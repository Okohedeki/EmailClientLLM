/**
 * Neutralinojs global type declarations.
 * The Neutralino global is injected by the runtime at startup.
 */

interface NeutralinoFilesystemEntry {
  entry: string;
  type: "FILE" | "DIRECTORY";
}

interface NeutralinoFilesystem {
  readFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<ArrayBuffer>;
  writeFile(path: string, data: string): Promise<void>;
  writeBinaryFile(path: string, data: ArrayBuffer): Promise<void>;
  readDirectory(path: string): Promise<NeutralinoFilesystemEntry[]>;
  createDirectory(path: string): Promise<void>;
  removeDirectory(path: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  moveFile(source: string, destination: string): Promise<void>;
  getStats(path: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }>;
}

interface NeutralinoOs {
  getEnv(key: string): Promise<string>;
  execCommand(command: string): Promise<{ stdOut: string; stdErr: string; exitCode: number }>;
  open(url: string): Promise<void>;
  getPath(name: string): Promise<string>;
}

interface NeutralinoApp {
  exit(code?: number): Promise<void>;
  getConfig(): Promise<Record<string, unknown>>;
}

interface NeutralinoWindow {
  setTitle(title: string): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
}

interface NeutralinoEvents {
  on(event: string, handler: (...args: unknown[]) => void): Promise<void>;
  off(event: string, handler: (...args: unknown[]) => void): Promise<void>;
}

declare const Neutralino: {
  filesystem: NeutralinoFilesystem;
  os: NeutralinoOs;
  app: NeutralinoApp;
  window: NeutralinoWindow;
  events: NeutralinoEvents;
  init(): void;
};
