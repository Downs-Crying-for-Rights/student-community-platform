import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConfideRequestFindMany = vi.fn();
const mockConfideRequestDeleteMany = vi.fn();
const mockMessageDeleteMany = vi.fn();
const mockCaseUpdateMany = vi.fn();
const mockAuditLogCount = vi.fn();

vi.mock("../prisma", () => ({
  default: {
    confideRequest: {
      findMany: (...args: unknown[]) => mockConfideRequestFindMany(...args),
      deleteMany: (...args: unknown[]) => mockConfideRequestDeleteMany(...args),
    },
    message: {
      deleteMany: (...args: unknown[]) => mockMessageDeleteMany(...args),
    },
    case: {
      updateMany: (...args: unknown[]) => mockCaseUpdateMany(...args),
    },
    auditLog: {
      count: (...args: unknown[]) => mockAuditLogCount(...args),
    },
  },
}));

import {
  cleanupExpiredConfideRequests,
  cleanupOldAnonymousSessions,
  archiveOldCases,
  countArchivableAuditLogs,
  cleanupExpiredListeningSessions,
  runAllCleanup,
} from "../cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-06-15T00:00:00Z"));
});

describe("数据清理模块", () => {
  describe("cleanupExpiredConfideRequests", () => {
    it("应删除已过期的倾诉请求及其关联消息", async () => {
      mockConfideRequestFindMany.mockResolvedValue([
        { id: "confide-1" },
        { id: "confide-2" },
      ]);
      mockMessageDeleteMany.mockResolvedValue({ count: 5 });
      mockConfideRequestDeleteMany.mockResolvedValue({ count: 2 });

      const result = await cleanupExpiredConfideRequests();

      expect(result).toBe(2);
      expect(mockConfideRequestFindMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
        select: { id: true },
      });
      expect(mockMessageDeleteMany).toHaveBeenCalledWith({
        where: { sessionId: { in: ["confide-1", "confide-2"] } },
      });
      expect(mockConfideRequestDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["confide-1", "confide-2"] } },
      });
    });

    it("无过期请求时应返回 0 且不执行删除", async () => {
      mockConfideRequestFindMany.mockResolvedValue([]);

      const result = await cleanupExpiredConfideRequests();

      expect(result).toBe(0);
      expect(mockMessageDeleteMany).not.toHaveBeenCalled();
      expect(mockConfideRequestDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe("cleanupOldAnonymousSessions", () => {
    it("应删除超过 90 天的匿名会话消息", async () => {
      mockMessageDeleteMany.mockResolvedValue({ count: 10 });

      const result = await cleanupOldAnonymousSessions();

      expect(result).toBe(10);
      expect(mockMessageDeleteMany).toHaveBeenCalledWith({
        where: {
          isAnonymous: true,
          caseId: null,
          createdAt: { lt: expect.any(Date) },
        },
      });

      // Verify the cutoff date is ~90 days ago
      const callArgs = mockMessageDeleteMany.mock.calls[0][0];
      const cutoff = callArgs.where.createdAt.lt as Date;
      const expectedCutoff = new Date("2024-03-17T00:00:00Z");
      expect(cutoff.toISOString().slice(0, 10)).toBe(
        expectedCutoff.toISOString().slice(0, 10),
      );
    });

    it("无匹配消息时应返回 0", async () => {
      mockMessageDeleteMany.mockResolvedValue({ count: 0 });

      const result = await cleanupOldAnonymousSessions();
      expect(result).toBe(0);
    });
  });

  describe("archiveOldCases", () => {
    it("应脱敏归档超过 180 天的已关闭工单", async () => {
      mockCaseUpdateMany.mockResolvedValue({ count: 3 });

      const result = await archiveOldCases();

      expect(result).toBe(3);
      expect(mockCaseUpdateMany).toHaveBeenCalledWith({
        where: {
          status: "CLOSED",
          updatedAt: { lt: expect.any(Date) },
          NOT: { formData: { equals: { archived: true } } },
        },
        data: {
          formData: { archived: true, archivedAt: expect.any(String) },
        },
      });

      // Verify the cutoff date is ~180 days ago
      const callArgs = mockCaseUpdateMany.mock.calls[0][0];
      const cutoff = callArgs.where.updatedAt.lt as Date;
      const expectedCutoff = new Date("2023-12-18T00:00:00Z");
      expect(cutoff.toISOString().slice(0, 10)).toBe(
        expectedCutoff.toISOString().slice(0, 10),
      );
    });

    it("无匹配工单时应返回 0", async () => {
      mockCaseUpdateMany.mockResolvedValue({ count: 0 });

      const result = await archiveOldCases();
      expect(result).toBe(0);
    });
  });

  describe("countArchivableAuditLogs", () => {
    it("应统计超过 180 天的审计日志数量", async () => {
      mockAuditLogCount.mockResolvedValue(42);

      const result = await countArchivableAuditLogs();

      expect(result).toBe(42);
      expect(mockAuditLogCount).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });
    });

    it("无匹配日志时应返回 0", async () => {
      mockAuditLogCount.mockResolvedValue(0);

      const result = await countArchivableAuditLogs();
      expect(result).toBe(0);
    });
  });

  describe("cleanupExpiredListeningSessions", () => {
    it("应删除超过 30 天的倾听会话消息", async () => {
      mockMessageDeleteMany.mockResolvedValue({ count: 7 });

      const result = await cleanupExpiredListeningSessions();

      expect(result).toBe(7);
      expect(mockMessageDeleteMany).toHaveBeenCalledWith({
        where: {
          sessionId: { not: null },
          createdAt: { lt: expect.any(Date) },
        },
      });

      // Verify the cutoff date is ~30 days ago
      const callArgs = mockMessageDeleteMany.mock.calls[0][0];
      const cutoff = callArgs.where.createdAt.lt as Date;
      const expectedCutoff = new Date("2024-05-16T00:00:00Z");
      expect(cutoff.toISOString().slice(0, 10)).toBe(
        expectedCutoff.toISOString().slice(0, 10),
      );
    });
  });

  describe("runAllCleanup", () => {
    it("应执行所有清理任务并返回汇总报告", async () => {
      mockConfideRequestFindMany.mockResolvedValue([{ id: "c-1" }]);
      mockMessageDeleteMany.mockResolvedValue({ count: 3 });
      mockConfideRequestDeleteMany.mockResolvedValue({ count: 1 });
      mockCaseUpdateMany.mockResolvedValue({ count: 2 });
      mockAuditLogCount.mockResolvedValue(10);

      const report = await runAllCleanup();

      expect(report).toEqual({
        expiredConfideRequests: 1,
        oldAnonymousSessionMessages: 3,
        archivedCases: 2,
        archivableAuditLogs: 10,
        expiredListeningSessions: 3,
        executedAt: expect.any(String),
      });
    });

    it("所有任务无数据时应返回全零报告", async () => {
      mockConfideRequestFindMany.mockResolvedValue([]);
      mockMessageDeleteMany.mockResolvedValue({ count: 0 });
      mockCaseUpdateMany.mockResolvedValue({ count: 0 });
      mockAuditLogCount.mockResolvedValue(0);

      const report = await runAllCleanup();

      expect(report.expiredConfideRequests).toBe(0);
      expect(report.oldAnonymousSessionMessages).toBe(0);
      expect(report.archivedCases).toBe(0);
      expect(report.archivableAuditLogs).toBe(0);
      expect(report.expiredListeningSessions).toBe(0);
      expect(report.executedAt).toBeTruthy();
    });
  });
});
