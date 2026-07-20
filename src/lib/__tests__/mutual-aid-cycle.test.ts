import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateParticipants,
  canTransitionLink,
  canTransitionCycle,
  buildCycleDirections,
  aggregateCycleLinkStatus,
  restoreCycleLinkStatus,
} from "../mutual-aid-cycle";

// ==================== Pure Function Tests ====================

describe("互助循环 — 纯函数测试", () => {
  describe("双方/三方链路", () => {
    it("双方模式生成 A→B 与 B→A", () => {
      expect(buildCycleDirections("TWO_PARTY", "a", "b")).toEqual([
        { dir: "AB", from: "a", to: "b", desc: undefined },
        { dir: "BA", from: "b", to: "a", desc: undefined },
      ]);
    });

    it("三方模式生成 A→B、B→C 与 C→A", () => {
      expect(buildCycleDirections("THREE_PARTY", "a", "b", "c").map((item) => item.dir)).toEqual(["AB", "BC", "CA"]);
    });
  });
  describe("validateParticipants", () => {
    it("A/B/C 互异时通过", () => {
      expect(validateParticipants("a", "b", "c")).toBeNull();
    });

    it("A=B 时返回错误", () => {
      expect(validateParticipants("a", "a", "c")).toContain("不同");
    });

    it("A=C 时返回错误", () => {
      expect(validateParticipants("a", "b", "a")).toContain("不同");
    });

    it("B=C 时返回错误", () => {
      expect(validateParticipants("a", "b", "b")).toContain("不同");
    });
  });

  describe("Link 状态流转 (canTransitionLink)", () => {
    it("PENDING_REQUEST → ACCEPTED: 允许", () => {
      expect(canTransitionLink("PENDING_REQUEST", "ACCEPTED").allowed).toBe(true);
    });

    it("PENDING_REQUEST → REJECTED: 允许", () => {
      expect(canTransitionLink("PENDING_REQUEST", "REJECTED").allowed).toBe(true);
    });

    it("ACCEPTED → IN_PROGRESS: 允许", () => {
      expect(canTransitionLink("ACCEPTED", "IN_PROGRESS").allowed).toBe(true);
    });

    it("IN_PROGRESS → COMPLETED: 允许", () => {
      expect(canTransitionLink("IN_PROGRESS", "COMPLETED").allowed).toBe(true);
    });

    it("IN_PROGRESS → DISPUTED: 允许", () => {
      expect(canTransitionLink("IN_PROGRESS", "DISPUTED").allowed).toBe(true);
    });

    it("COMPLETED → ACCEPTED: 拒绝 (终态)", () => {
      expect(canTransitionLink("COMPLETED", "ACCEPTED").allowed).toBe(false);
    });

    it("REJECTED → ACCEPTED: 拒绝 (终态)", () => {
      expect(canTransitionLink("REJECTED", "ACCEPTED").allowed).toBe(false);
    });

    it("DISPUTED → IN_PROGRESS: 拒绝 (终态)", () => {
      expect(canTransitionLink("DISPUTED", "IN_PROGRESS").allowed).toBe(false);
    });

    it("PENDING_REQUEST → COMPLETED: 拒绝 (跳过中间状态)", () => {
      expect(canTransitionLink("PENDING_REQUEST", "COMPLETED").allowed).toBe(false);
    });

    it("ACCEPTED → DISPUTED: 允许", () => {
      expect(canTransitionLink("ACCEPTED", "DISPUTED").allowed).toBe(true);
    });
  });

  describe("Cycle 状态流转 (canTransitionCycle)", () => {
    it("INITIATING → ACTIVE: 允许", () => {
      expect(canTransitionCycle("INITIATING", "ACTIVE").allowed).toBe(true);
    });

    it("INITIATING → BROKEN: 允许", () => {
      expect(canTransitionCycle("INITIATING", "BROKEN").allowed).toBe(true);
    });

    it("ACTIVE → COMPLETED: 允许", () => {
      expect(canTransitionCycle("ACTIVE", "COMPLETED").allowed).toBe(true);
    });

    it("ACTIVE → BROKEN: 允许", () => {
      expect(canTransitionCycle("ACTIVE", "BROKEN").allowed).toBe(true);
    });

    it("COMPLETED → ACTIVE: 拒绝 (终态)", () => {
      expect(canTransitionCycle("COMPLETED", "ACTIVE").allowed).toBe(false);
    });

    it("BROKEN → ACTIVE: 拒绝 (终态)", () => {
      expect(canTransitionCycle("BROKEN", "ACTIVE").allowed).toBe(false);
    });

    it("所有终态不能再流转", () => {
      const terminals: any[] = ["COMPLETED", "BROKEN", "CLOSED"];
      for (const t of terminals) {
        expect(canTransitionCycle(t, "INITIATING").allowed).toBe(false);
        expect(canTransitionCycle(t, "ACTIVE").allowed).toBe(false);
        expect(canTransitionCycle(t, "COMPLETED").allowed).toBe(false);
      }
    });
  });

  describe("争议恢复状态", () => {
    it("restores the prior active link state or resets the invitation", () => {
      expect(restoreCycleLinkStatus("IN_PROGRESS", "resume")).toBe("IN_PROGRESS");
      expect(restoreCycleLinkStatus("ACCEPTED", "resume")).toBe("ACCEPTED");
      expect(restoreCycleLinkStatus(null, "resume")).toBe("ACCEPTED");
      expect(restoreCycleLinkStatus("IN_PROGRESS", "reinvite")).toBe("PENDING_REQUEST");
    });

    it("aggregates mixed links after one dispute is resolved", () => {
      expect(aggregateCycleLinkStatus(["IN_PROGRESS", "ACCEPTED", "COMPLETED"])).toBe("ACTIVE");
      expect(aggregateCycleLinkStatus(["IN_PROGRESS", "DISPUTED", "COMPLETED"])).toBe("BROKEN");
      expect(aggregateCycleLinkStatus(["PENDING_REQUEST", "ACCEPTED", "COMPLETED"])).toBe("INITIATING");
      expect(aggregateCycleLinkStatus(["COMPLETED", "COMPLETED", "COMPLETED"])).toBe("COMPLETED");
      expect(aggregateCycleLinkStatus(["CLOSED", "COMPLETED", "COMPLETED"])).toBe("CLOSED");
    });
  });

  describe("异常场景 — 非法流转", () => {
    it("ACTIVE → COMPLETED ↔ BROKEN 不能同时发生", () => {
      // 验证进入终态后不可再变
      expect(canTransitionCycle("ACTIVE", "COMPLETED").allowed).toBe(true);
      expect(canTransitionCycle("ACTIVE", "BROKEN").allowed).toBe(true);
      // 但任一终态进入后不能再出
      expect(canTransitionCycle("COMPLETED", "ACTIVE").allowed).toBe(false);
      expect(canTransitionCycle("BROKEN", "ACTIVE").allowed).toBe(false);
    });

    it("同一 Link 不能从 COMPLETED 回退", () => {
      expect(canTransitionLink("COMPLETED", "IN_PROGRESS").allowed).toBe(false);
      expect(canTransitionLink("COMPLETED", "ACCEPTED").allowed).toBe(false);
      expect(canTransitionLink("COMPLETED", "DISPUTED").allowed).toBe(false);
    });
  });
});
