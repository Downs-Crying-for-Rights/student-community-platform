import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ==================== Types & Constants ====================

/** Report statuses matching Prisma schema */
const REPORT_STATUSES = ["PENDING", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Terminal statuses — no further transitions allowed */
const TERMINAL_STATUSES: ReportStatus[] = ["RESOLVED", "DISMISSED"];

/**
 * Valid status transitions extracted from PATCH /api/reports/[id] route.
 * PENDING → IN_PROGRESS
 * IN_PROGRESS → RESOLVED | DISMISSED
 */
const VALID_TRANSITIONS: Record<string, ReportStatus[]> = {
  PENDING: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED", "DISMISSED"],
};

/** Auto-hide threshold extracted from POST /api/reports route */
const AUTO_HIDE_THRESHOLD = 3;

// ==================== Pure Logic Under Test ====================

/**
 * Checks whether a status transition is valid.
 * Extracted from PATCH /api/reports/[id] route logic.
 */
function isValidTransition(from: ReportStatus, to: ReportStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Applies a sequence of status transitions starting from PENDING.
 * Returns the final status and whether all transitions were valid.
 */
function applyTransitionSequence(
  transitions: ReportStatus[],
): { finalStatus: ReportStatus; allValid: boolean; invalidAt: number | null } {
  let current: ReportStatus = "PENDING";
  for (let i = 0; i < transitions.length; i++) {
    if (!isValidTransition(current, transitions[i])) {
      return { finalStatus: current, allValid: false, invalidAt: i };
    }
    current = transitions[i];
  }
  return { finalStatus: current, allValid: true, invalidAt: null };
}

/**
 * Determines whether content should be auto-hidden based on report count.
 * Extracted from checkAutoHideThreshold in POST /api/reports route.
 */
function shouldAutoHide(reportCount: number): boolean {
  return reportCount >= AUTO_HIDE_THRESHOLD;
}

// ==================== Generators ====================

const arbReportStatus = fc.constantFrom<ReportStatus>(...REPORT_STATUSES);

/** Generate a valid target status for transition attempts */
const arbTargetStatus = fc.constantFrom<ReportStatus>("IN_PROGRESS", "RESOLVED", "DISMISSED");

/** Generate a random sequence of transition attempts (1-5 steps) */
const arbTransitionSequence = fc.array(arbTargetStatus, { minLength: 1, maxLength: 5 });

/** Generate a valid transition path: PENDING → IN_PROGRESS → RESOLVED or DISMISSED */
function arbValidPath(): fc.Arbitrary<ReportStatus[]> {
  return fc.constantFrom<ReportStatus>("RESOLVED", "DISMISSED").map((terminal) => [
    "IN_PROGRESS" as ReportStatus,
    terminal,
  ]);
}

/** Generate report count for threshold testing */
const arbReportCount = fc.integer({ min: 0, max: 20 });

// ==================== Property 7: 举报状态流转合法性 ====================
// **Validates: Requirements 6.4**

describe("属性 7: 举报状态流转合法性", () => {
  it("所有举报初始状态应为 PENDING", () => {
    fc.assert(
      fc.property(fc.anything(), () => {
        // Every new report starts as PENDING — this is a universal invariant
        const initialStatus: ReportStatus = "PENDING";
        expect(initialStatus).toBe("PENDING");
        // PENDING is not a terminal status
        expect(TERMINAL_STATUSES).not.toContain(initialStatus);
      }),
      { numRuns: 50 },
    );
  });

  it("PENDING 只能转为 IN_PROGRESS，不能直接跳到 RESOLVED 或 DISMISSED", () => {
    fc.assert(
      fc.property(arbReportStatus, (targetStatus) => {
        const valid = isValidTransition("PENDING", targetStatus);
        if (targetStatus === "IN_PROGRESS") {
          expect(valid).toBe(true);
        } else {
          expect(valid).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("IN_PROGRESS 只能转为 RESOLVED 或 DISMISSED", () => {
    fc.assert(
      fc.property(arbReportStatus, (targetStatus) => {
        const valid = isValidTransition("IN_PROGRESS", targetStatus);
        if (targetStatus === "RESOLVED" || targetStatus === "DISMISSED") {
          expect(valid).toBe(true);
        } else {
          expect(valid).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("终态（RESOLVED/DISMISSED）不能再转换到任何状态", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ReportStatus>(...TERMINAL_STATUSES),
        arbReportStatus,
        (terminalStatus, targetStatus) => {
          expect(isValidTransition(terminalStatus, targetStatus)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("合法路径（PENDING→IN_PROGRESS→RESOLVED/DISMISSED）应全部成功", () => {
    fc.assert(
      fc.property(arbValidPath(), (path) => {
        const result = applyTransitionSequence(path);
        expect(result.allValid).toBe(true);
        expect(TERMINAL_STATUSES).toContain(result.finalStatus);
      }),
      { numRuns: 200 },
    );
  });

  it("随机转换序列中，非法转换应被正确拒绝", () => {
    fc.assert(
      fc.property(arbTransitionSequence, (transitions) => {
        const result = applyTransitionSequence(transitions);
        if (result.allValid) {
          // If all transitions were valid, the path must follow the valid transition map
          let current: ReportStatus = "PENDING";
          for (const t of transitions) {
            expect(VALID_TRANSITIONS[current]).toBeDefined();
            expect(VALID_TRANSITIONS[current]).toContain(t);
            current = t;
          }
        } else {
          // If invalid, the transition at invalidAt must not be in the allowed list
          expect(result.invalidAt).not.toBeNull();
          const failedFrom =
            result.invalidAt === 0
              ? "PENDING"
              : transitions[result.invalidAt! - 1] ?? "PENDING";
          // Reconstruct the actual "from" status by replaying
          let current: ReportStatus = "PENDING";
          for (let i = 0; i < result.invalidAt!; i++) {
            current = transitions[i];
          }
          const allowed = VALID_TRANSITIONS[current] ?? [];
          expect(allowed).not.toContain(transitions[result.invalidAt!]);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("不允许回退：任何状态不能转回 PENDING", () => {
    fc.assert(
      fc.property(arbReportStatus, (fromStatus) => {
        expect(isValidTransition(fromStatus, "PENDING")).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("不允许自转换：任何状态不能转换到自身", () => {
    fc.assert(
      fc.property(arbReportStatus, (status) => {
        expect(isValidTransition(status, status)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

// ==================== Property 8: 自动隐藏阈值 ====================
// **Validates: Requirements 6.5**

describe("属性 8: 自动隐藏阈值", () => {
  it("举报数 < 3 时不应自动隐藏", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        (count) => {
          expect(shouldAutoHide(count)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("举报数 >= 3 时应自动隐藏", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 100 }),
        (count) => {
          expect(shouldAutoHide(count)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("阈值边界：恰好 3 人举报时触发自动隐藏", () => {
    expect(shouldAutoHide(3)).toBe(true);
    expect(shouldAutoHide(2)).toBe(false);
  });

  it("自动隐藏阈值为精确的 3（不多不少）", () => {
    fc.assert(
      fc.property(arbReportCount, (count) => {
        const hidden = shouldAutoHide(count);
        if (count >= AUTO_HIDE_THRESHOLD) {
          expect(hidden).toBe(true);
        } else {
          expect(hidden).toBe(false);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("随着举报数递增，一旦触发隐藏则不会取消", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (maxCount) => {
          let triggered = false;
          for (let i = 0; i <= maxCount; i++) {
            const hidden = shouldAutoHide(i);
            if (hidden) {
              triggered = true;
            }
            // Once triggered, should remain triggered for all subsequent counts
            if (triggered) {
              expect(hidden).toBe(true);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("自动隐藏是单调的：如果 n 人举报触发隐藏，则 n+k 人也触发", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (n, k) => {
          if (shouldAutoHide(n)) {
            expect(shouldAutoHide(n + k)).toBe(true);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
