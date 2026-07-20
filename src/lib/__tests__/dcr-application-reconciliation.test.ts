import { describe, expect, it, vi } from "vitest";
import { reconcileRejectedDcrApplications } from "../dcr-application-reconciliation";

describe("reconcileRejectedDcrApplications", () => {
  it("只终结关联已驳回 Case 的待审 DCR 申请", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await reconcileRejectedDcrApplications({ accessApplication: { updateMany } } as never, "user1");
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        applicantId: "user1",
        type: "DCR",
        status: "PENDING",
        case_: { requestStatus: "REJECTED" },
      },
      data: {
        status: "REJECTED",
        reviewedAt: expect.any(Date),
      },
    });
  });
});
