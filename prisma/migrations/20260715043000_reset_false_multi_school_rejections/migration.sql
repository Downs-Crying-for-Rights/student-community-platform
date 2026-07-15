-- The previous multi-school heuristic counted field labels such as
-- “学校名称 / 学校性质 / 学校地址” and falsely rejected single-school cases.
-- Return affected cases to the explicit admin-review queue.
UPDATE "Case"
SET
  "requestStatus" = 'PENDING'::"RequestStatus",
  "reviewNote" = '委托已提交，正在等待管理员审核',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "requestStatus" = 'REJECTED'::"RequestStatus"
  AND "reviewNote" = '检测到多个学校名称，每次委托仅限提交一所学校的信息';

UPDATE "TimelineEvent"
SET "details" = '委托已提交，正在等待管理员审核；审核通过前仅提交者和管理员可见'
WHERE
  "action" = '委托创建'
  AND "details" = '审核结果: REJECTED - 检测到多个学校名称，每次委托仅限提交一所学校的信息';
