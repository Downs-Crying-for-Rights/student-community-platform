import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(path) : entry.name === "route.ts" ? [path] : [];
  });
}

describe("Route Handler telemetry inventory", () => {
  it("requires every exported route method to use an approved completion wrapper", () => {
    const appRoot = join(process.cwd(), "src", "app");
    const uncovered: string[] = [];
    for (const file of routeFiles(appRoot)) {
      const source = readFileSync(file, "utf8");
      const directFunctions = [...source.matchAll(new RegExp(`export\\s+(?:async\\s+)?function\\s+(${METHODS})\\b`, "g"))];
      const exports = [...source.matchAll(new RegExp(`export\\s+const\\s+(${METHODS})\\s*=\\s*([^;\\n]+)`, "g"))];
      for (const match of directFunctions) uncovered.push(`${relative(appRoot, file)}:${match[1]} (direct function)`);
      for (const match of exports) {
        const initializer = match[2].trim();
        if (!["withAuth", "withOptionalAuth", "withTelemetry"].some((wrapper) => initializer.startsWith(`${wrapper}(`))) {
          uncovered.push(`${relative(appRoot, file)}:${match[1]} (${initializer.slice(0, 40)})`);
        }
      }
    }
    expect(uncovered, `Uncovered route methods:\n${uncovered.join("\n")}`).toEqual([]);
  });
});
