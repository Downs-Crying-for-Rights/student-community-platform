import { z } from "zod";

const cursorSchema = z.object({
  scope: z.string().min(1).max(300),
  direction: z.enum(["older", "newer"]),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().min(1).max(191),
}).strict();

export interface CompoundCursor {
  createdAt: Date;
  id: string;
}

export function encodeCompoundCursor(
  scope: string,
  direction: "older" | "newer",
  row: { createdAt: Date; id: string },
): string {
  return Buffer.from(JSON.stringify({
    scope,
    direction,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  })).toString("base64url");
}

export function parseCompoundCursor(
  value: string,
  scope: string,
  direction: "older" | "newer",
): CompoundCursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.scope !== scope || parsed.data.direction !== direction) return null;
    const createdAt = new Date(parsed.data.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return null;
    return { createdAt, id: parsed.data.id };
  } catch {
    return null;
  }
}

export function cursorWhere(
  cursor: CompoundCursor,
  direction: "older" | "newer",
  timestampField: "createdAt" | "updatedAt" = "createdAt",
) {
  const dateOperator = direction === "older" ? "lt" : "gt";
  const idOperator = direction === "older" ? "lt" : "gt";
  return {
    OR: [
      { [timestampField]: { [dateOperator]: cursor.createdAt } },
      { [timestampField]: cursor.createdAt, id: { [idOperator]: cursor.id } },
    ],
  };
}
