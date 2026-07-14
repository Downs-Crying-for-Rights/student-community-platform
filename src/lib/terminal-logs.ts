import { open, stat } from "node:fs/promises";
import path from "node:path";

export const TERMINAL_LOG_SOURCES = {
  services: { label: "应用 / PostgreSQL / Redis", file: "services.log" },
  "nginx-access": { label: "Nginx 访问", file: "nginx-access.log" },
  "nginx-error": { label: "Nginx 错误", file: "nginx-error.log" },
  deployment: { label: "部署过程", file: "deployment.log" },
} as const;

export type TerminalLogSource = keyof typeof TERMINAL_LOG_SOURCES;

const MAX_READ_BYTES = 512 * 1024;

export function isTerminalLogSource(value: string): value is TerminalLogSource {
  return Object.prototype.hasOwnProperty.call(TERMINAL_LOG_SOURCES, value);
}

export function redactTerminalOutput(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/((?:password|passwd|secret|token|api[_-]?key|access[_-]?key(?:[_-]?secret)?)\s*[:=]\s*)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[REDACTED]")
    .replace(/\bLTAI[A-Za-z0-9]{12,}\b/g, "LTAI[REDACTED]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export async function readTerminalLog(
  source: TerminalLogSource,
  requestedLines: number,
): Promise<{ content: string; size: number; modifiedAt: string | null }> {
  const logDirectory = process.env.TERMINAL_LOG_DIR || "/var/log/forum";
  const filePath = path.join(logDirectory, TERMINAL_LOG_SOURCES[source].file);
  const lines = Math.min(Math.max(requestedLines, 50), 1000);

  try {
    const fileStat = await stat(filePath);
    const bytesToRead = Math.min(fileStat.size, MAX_READ_BYTES);
    const offset = Math.max(0, fileStat.size - bytesToRead);
    const handle = await open(filePath, "r");

    try {
      const buffer = Buffer.alloc(bytesToRead);
      await handle.read(buffer, 0, bytesToRead, offset);
      const raw = buffer.toString("utf8");
      const completeText = offset > 0 ? raw.slice(raw.indexOf("\n") + 1) : raw;
      const content = completeText.split(/\r?\n/).slice(-lines).join("\n");
      return {
        content: redactTerminalOutput(content),
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { content: "", size: 0, modifiedAt: null };
    }
    throw error;
  }
}
