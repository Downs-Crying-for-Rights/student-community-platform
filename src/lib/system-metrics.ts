import { readFile } from "node:fs/promises";
import os from "node:os";

export interface SystemMetrics {
  collectedAt: string;
  identity: {
    serviceAddress: string | null;
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    nodeVersion: string;
  };
  process: {
    pid: number;
    uptimeSeconds: number;
    cpuPercent: number | null;
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
  };
  runtime: {
    scope: "container" | "os-visible";
    logicalCpuCount: number;
    effectiveCpuCount: number;
    cpuPercent: number | null;
    loadAverage: [number, number, number] | null;
    memoryUsedBytes: number;
    memoryLimitBytes: number;
    memoryPercent: number;
    uptimeSeconds: number;
  };
  network: {
    scope: "container" | "os-visible";
    addresses: Array<{ interface: string; family: "IPv4" | "IPv6"; address: string }>;
    rxBytes: number | null;
    txBytes: number | null;
    rxBytesPerSecond: number | null;
    txBytesPerSecond: number | null;
  };
  capabilities: {
    cgroup: boolean;
    networkCounters: boolean;
    hostMetrics: false;
  };
}

type CpuSnapshot = { idle: number; total: number };
type TimedCounter = { at: number; rx: number; tx: number };

let previousCpu: CpuSnapshot | null = null;
let previousProcessCpu: { at: bigint; usage: NodeJS.CpuUsage } | null = null;
let previousCgroupCpu: { at: number; usageMicros: number } | null = null;
let previousNetwork: TimedCounter | null = null;

function finitePercent(value: number): number | null {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value * 10) / 10)) : null;
}

function cpuSnapshot(): CpuSnapshot {
  return os.cpus().reduce((sum, cpu) => {
    const values = Object.values(cpu.times);
    return { idle: sum.idle + cpu.times.idle, total: sum.total + values.reduce((a, b) => a + b, 0) };
  }, { idle: 0, total: 0 });
}

function sampleCpuPercent(current: CpuSnapshot): number | null {
  const prior = previousCpu;
  previousCpu = current;
  if (!prior) return null;
  const total = current.total - prior.total;
  const idle = current.idle - prior.idle;
  return total > 0 ? finitePercent(((total - idle) / total) * 100) : null;
}

function sampleProcessCpuPercent(effectiveCpuCount: number): number | null {
  const current = { at: process.hrtime.bigint(), usage: process.cpuUsage() };
  const prior = previousProcessCpu;
  previousProcessCpu = current;
  if (!prior) return null;
  const elapsedMicros = Number(current.at - prior.at) / 1_000;
  const usedMicros = current.usage.user - prior.usage.user + current.usage.system - prior.usage.system;
  return elapsedMicros > 0 ? finitePercent((usedMicros / elapsedMicros / effectiveCpuCount) * 100) : null;
}

async function readSmallFile(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, "utf8");
    return content.length <= 64 * 1024 ? content : null;
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value || value.trim() === "max") return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseCpuLimit(value: string | null, logicalCpuCount: number): number {
  if (!value) return logicalCpuCount;
  const [quotaValue, periodValue] = value.trim().split(/\s+/);
  if (quotaValue === "max") return logicalCpuCount;
  const quota = Number(quotaValue);
  const period = Number(periodValue);
  if (!Number.isFinite(quota) || !Number.isFinite(period) || quota <= 0 || period <= 0) return logicalCpuCount;
  return Math.max(0.01, Math.min(logicalCpuCount, quota / period));
}

export function parseCgroupCpuUsage(value: string | null): number | null {
  const match = value?.match(/^usage_usec\s+(\d+)$/m);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function sampleCgroupCpuPercent(usageMicros: number | null, at: number, effectiveCpuCount: number): number | null {
  if (usageMicros === null) return null;
  const current = { at, usageMicros };
  const prior = previousCgroupCpu;
  previousCgroupCpu = current;
  if (!prior) return null;
  const elapsedMicros = (at - prior.at) * 1_000;
  return elapsedMicros > 0
    ? finitePercent(((usageMicros - prior.usageMicros) / elapsedMicros / effectiveCpuCount) * 100)
    : null;
}

export function parseProcNetDev(value: string | null): { rx: number; tx: number } | null {
  if (!value) return null;
  let rx = 0;
  let tx = 0;
  let found = false;
  for (const line of value.split("\n").slice(2)) {
    const [namePart, countersPart] = line.split(":", 2);
    const name = namePart?.trim();
    if (!name || name === "lo" || !countersPart) continue;
    const counters = countersPart.trim().split(/\s+/).map(Number);
    if (counters.length < 9 || !Number.isFinite(counters[0]) || !Number.isFinite(counters[8])) continue;
    rx += counters[0];
    tx += counters[8];
    found = true;
  }
  return found ? { rx, tx } : null;
}

function serviceAddress(): string | null {
  const configured = process.env.SERVER_DISPLAY_ADDRESS || process.env.NEXTAUTH_URL;
  if (!configured) return null;
  try {
    return new URL(configured).origin.slice(0, 200);
  } catch {
    return configured.slice(0, 200).replace(/[\r\n\t]/g, " ");
  }
}

function networkAddresses(): SystemMetrics["network"]["addresses"] {
  return Object.entries(os.networkInterfaces()).flatMap(([interfaceName, entries]) =>
    (entries ?? []).flatMap((entry) => {
      if (entry.internal || (entry.family !== "IPv4" && entry.family !== "IPv6")) return [];
      return [{ interface: interfaceName.slice(0, 64), family: entry.family, address: entry.address.slice(0, 128) }];
    }),
  ).slice(0, 32);
}

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const logicalCpuCount = Math.max(1, os.cpus().length);
  const [memoryCurrentRaw, memoryMaxRaw, cpuMaxRaw, cpuStatRaw, networkRaw] = await Promise.all([
    readSmallFile("/sys/fs/cgroup/memory.current"),
    readSmallFile("/sys/fs/cgroup/memory.max"),
    readSmallFile("/sys/fs/cgroup/cpu.max"),
    readSmallFile("/sys/fs/cgroup/cpu.stat"),
    readSmallFile("/proc/net/dev"),
  ]);
  const cgroupMemoryCurrent = parsePositiveInteger(memoryCurrentRaw);
  const cgroupMemoryLimit = parsePositiveInteger(memoryMaxRaw);
  const hasCgroup = cgroupMemoryCurrent !== null || cpuMaxRaw !== null;
  const memoryLimitBytes = cgroupMemoryLimit ?? os.totalmem();
  const memoryUsedBytes = cgroupMemoryCurrent ?? Math.max(0, os.totalmem() - os.freemem());
  const effectiveCpuCount = parseCpuLimit(cpuMaxRaw, logicalCpuCount);
  const cgroupCpuUsage = parseCgroupCpuUsage(cpuStatRaw);
  const network = parseProcNetDev(networkRaw);
  const now = Date.now();
  const priorNetwork = previousNetwork;
  if (network) previousNetwork = { at: now, ...network };
  const elapsedSeconds = priorNetwork ? (now - priorNetwork.at) / 1_000 : 0;
  const memory = process.memoryUsage();
  const load = os.platform() === "win32" ? null : os.loadavg() as [number, number, number];

  return {
    collectedAt: new Date(now).toISOString(),
    identity: {
      serviceAddress: serviceAddress(),
      hostname: os.hostname().slice(0, 128),
      platform: os.platform(),
      release: os.release().slice(0, 128),
      arch: os.arch(),
      nodeVersion: process.version,
    },
    process: {
      pid: process.pid,
      uptimeSeconds: process.uptime(),
      cpuPercent: sampleProcessCpuPercent(effectiveCpuCount),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
    },
    runtime: {
      scope: hasCgroup ? "container" : "os-visible",
      logicalCpuCount,
      effectiveCpuCount,
      cpuPercent: hasCgroup
        ? sampleCgroupCpuPercent(cgroupCpuUsage, now, effectiveCpuCount)
        : sampleCpuPercent(cpuSnapshot()),
      loadAverage: load,
      memoryUsedBytes,
      memoryLimitBytes,
      memoryPercent: finitePercent((memoryUsedBytes / memoryLimitBytes) * 100) ?? 0,
      uptimeSeconds: os.uptime(),
    },
    network: {
      scope: network ? "container" : "os-visible",
      addresses: networkAddresses(),
      rxBytes: network?.rx ?? null,
      txBytes: network?.tx ?? null,
      rxBytesPerSecond: network && priorNetwork && elapsedSeconds > 0 ? Math.max(0, (network.rx - priorNetwork.rx) / elapsedSeconds) : null,
      txBytesPerSecond: network && priorNetwork && elapsedSeconds > 0 ? Math.max(0, (network.tx - priorNetwork.tx) / elapsedSeconds) : null,
    },
    capabilities: { cgroup: hasCgroup, networkCounters: network !== null, hostMetrics: false },
  };
}
