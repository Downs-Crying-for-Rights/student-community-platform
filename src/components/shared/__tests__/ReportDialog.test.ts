import { describe, expect, it } from "vitest";
import { buildReportPayload, REPORT_REASONS } from "../ReportDialog";

describe("ReportDialog", () => {
  it("保留唯一举报目标并清理补充说明", () => {
    expect(buildReportPayload(
      { targetDmMessageId: "cm1234567890123456789012" },
      "辱骂、骚扰或威胁",
      "  对方连续发送威胁内容  ",
    )).toEqual({
      targetDmMessageId: "cm1234567890123456789012",
      reason: "辱骂、骚扰或威胁",
      details: "对方连续发送威胁内容",
    });
  });

  it("空补充说明不会进入请求体", () => {
    expect(buildReportPayload(
      { targetPostId: "cm1234567890123456789012" },
      REPORT_REASONS[0],
      "   ",
    )).toEqual({
      targetPostId: "cm1234567890123456789012",
      reason: REPORT_REASONS[0],
    });
  });
});
