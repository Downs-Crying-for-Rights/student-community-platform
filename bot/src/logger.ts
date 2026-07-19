type Level = "info" | "warn" | "error";

function write(level: Level, event: string, fields: Record<string, string | number | boolean> = {}): void {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level, event, ...fields })}\n`);
}

export const logger = {
  info: (event: string, fields?: Record<string, string | number | boolean>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, string | number | boolean>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, string | number | boolean>) => write("error", event, fields),
};
