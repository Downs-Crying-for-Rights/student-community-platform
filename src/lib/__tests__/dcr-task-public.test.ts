import { describe, expect, it } from "vitest";

import { getPublicDcrTaskCopy } from "@/lib/dcr-task-public";

describe("getPublicDcrTaskCopy", () => {
  it("returns fixed category copy without using private form content", () => {
    expect(getPublicDcrTaskCopy("TUTORING")).toEqual({
      title: "补课相关互助委托",
      summary: "一份已通过管理员审核的补课相关委托，具体信息仅向参与者开放。",
      expectedHelpType: "协助核实情况并提供合规互助",
    });
  });

  it("uses a generic projection for unknown categories", () => {
    const projection = getPublicDcrTaskCopy("PRIVATE_SCHOOL_NAME");

    expect(projection.title).toBe("校园事务互助委托");
    expect(JSON.stringify(projection)).not.toContain("PRIVATE_SCHOOL_NAME");
  });
});
