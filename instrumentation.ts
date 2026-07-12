/**
 * Next.js Instrumentation
 *
 * Runs once at server startup. Registers global console interceptors
 * that write all console.log / console.error / console.warn / console.debug
 * output to the SystemLog database table, so they appear in /admin/logs.
 *
 * The original console methods are preserved and still output to stdout/stderr.
 */

import { PrismaClient } from "@prisma/client";

// Dedicated Prisma instance for logging (avoids circular dependency with lib/prisma)
const logPrisma = new PrismaClient();

// Flush queue to avoid overwhelming DB on rapid bursts
let logQueue: Array<{ level: string; message: string; detail?: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 2000; // flush every 2 seconds
const MAX_QUEUE_SIZE = 100; // force flush if queue exceeds this

async function flushQueue() {
  if (logQueue.length === 0) return;
  const batch = logQueue.splice(0, logQueue.length);
  try {
    await logPrisma.systemLog.createMany({
      data: batch.map((entry) => ({
        level: entry.level,
        source: "console",
        message: entry.message.slice(0, 2000),
        detail: entry.detail?.slice(0, 5000) ?? null,
      })),
    });
  } catch {
    // Could not persist — do not crash the process
  }
}

function enqueueLog(level: string, message: string, detail?: string) {
  logQueue.push({ level, message, detail });
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    flushQueue().catch(() => {});
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushQueue().catch(() => {});
    }, FLUSH_INTERVAL_MS);
  }
}

// Patch console methods
const _originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  debug: console.debug.bind(console),
};

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

console.log = (...args: unknown[]) => {
  _originalConsole.log(...args);
  enqueueLog("INFO", formatArgs(args));
};

console.error = (...args: unknown[]) => {
  _originalConsole.error(...args);
  enqueueLog("ERROR", formatArgs(args));
};

console.warn = (...args: unknown[]) => {
  _originalConsole.warn(...args);
  enqueueLog("WARN", formatArgs(args));
};

console.debug = (...args: unknown[]) => {
  _originalConsole.debug(...args);
  enqueueLog("DEBUG", formatArgs(args));
};

export async function register() {
  // Only run on server (instrumentation.ts has both edge and node envs)
  if (typeof window !== "undefined") return;

  _originalConsole.log("[instrumentation] Console-to-SystemLog interceptor registered");
}
