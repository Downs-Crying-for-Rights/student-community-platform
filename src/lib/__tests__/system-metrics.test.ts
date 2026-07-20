import { describe, expect, it } from "vitest";

import { collectSystemMetrics, parseCgroupCpuUsage, parseCpuLimit, parseProcNetDev } from "@/lib/system-metrics";

describe("system metrics", () => {
  it("parses cgroup CPU limits and usage", () => {
    expect(parseCpuLimit("200000 100000", 8)).toBe(2);
    expect(parseCpuLimit("max 100000", 8)).toBe(8);
    expect(parseCpuLimit("invalid", 8)).toBe(8);
    expect(parseCgroupCpuUsage("usage_usec 12345\nuser_usec 10000\n")).toBe(12345);
    expect(parseCgroupCpuUsage("invalid")).toBeNull();
  });

  it("parses network counters and excludes loopback", () => {
    const result = parseProcNetDev([
      "Inter-| Receive | Transmit",
      " face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed",
      " lo: 100 0 0 0 0 0 0 0 200 0 0 0 0 0 0 0",
      " eth0: 1000 0 0 0 0 0 0 0 2500 0 0 0 0 0 0 0",
    ].join("\n"));
    expect(result).toEqual({ rx: 1000, tx: 2500 });
  });

  it("returns a bounded DTO without environment or MAC data", async () => {
    const metrics = await collectSystemMetrics();
    expect(metrics.process.pid).toBe(process.pid);
    expect(metrics.process.rssBytes).toBeGreaterThan(0);
    expect(metrics.runtime.logicalCpuCount).toBeGreaterThan(0);
    expect(metrics.runtime.memoryLimitBytes).toBeGreaterThan(0);
    expect(JSON.stringify(metrics)).not.toContain("password");
    expect(metrics.network.addresses.every((item) => !item.address.includes("00:00:00"))).toBe(true);
  });
});
