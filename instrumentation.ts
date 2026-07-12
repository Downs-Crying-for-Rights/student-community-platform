/**
 * Next.js Instrumentation
 *
 * Hooks into the server startup to enable system-level logging.
 * Uses setTimeout-deferred import of the shared Prisma client to avoid
 * circular dependency issues with ESM module loading during registration.
 */
let patchesApplied = false;

export async function register() {
  // Only run once and only on server
  if (patchesApplied || typeof window !== "undefined") return;
  patchesApplied = true;

  // Defer imports to avoid circular deps during module init
  setTimeout(async () => {
    try {
      const { default: prisma } = await import("@/lib/prisma");

      // Receive raw console output
      const _log = console.log.bind(console);
      const _error = console.error.bind(console);
      const _warn = console.warn.bind(console);
      const _debug = console.debug.bind(console);

      const format = (args: unknown[]): string =>
        args.map((a) =>
          a instanceof Error ? `${a.name}: ${a.message}`
          : typeof a === "string" ? a
          : JSON.stringify(a)
        ).join(" ").slice(0, 2000);

      // Batch writer with 3s flush interval, max 200 queue
      type QueueEntry = { level: string; message: string; detail?: string };
      let queue: QueueEntry[] = [];
      let timer: ReturnType<typeof setTimeout> | null = null;

      const flush = async () => {
        if (queue.length === 0) return;
        const batch = queue.splice(0);
        try {
          await prisma.systemLog.createMany({
            data: batch.map((e) => ({
              level: e.level,
              source: "console",
              message: e.message,
              detail: e.detail?.slice(0, 5000) ?? null,
            })),
          });
        } catch { /* failsafe */ }
      };

      const enqueue = (level: string, args: unknown[]) => {
        queue.push({ level, message: format(args) });
        if (queue.length >= 200) flush();
        if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 3000);
      };

      console.log   = (...a: unknown[]) => { _log(...a);   enqueue("INFO", a); };
      console.error = (...a: unknown[]) => { _error(...a); enqueue("ERROR", a); };
      console.warn  = (...a: unknown[]) => { _warn(...a);  enqueue("WARN", a); };
      console.debug = (...a: unknown[]) => { _debug(...a); enqueue("DEBUG", a); };

      console.log("[instrumentation] SystemLog interceptor active");
    } catch {
      // Logger not available — that's fine, just skip
    }
  }, 0);
}
