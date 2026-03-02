/**
 * DCR UI 纯函数工具模块
 *
 * 提供工单详情页、消息面板、Helper 工作台所需的纯函数。
 * 所有函数无副作用，便于单元测试和属性测试。
 */

/* ========== Types ========== */

/** 工单状态（与 Prisma CaseStatus 枚举对齐） */
export type CaseStatus = "OPENED" | "IN_PROGRESS" | "NEED_MORE_INFO" | "CLOSED";

/** 按钮变体（与 shadcn/ui Button variant 对齐） */
export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

/** 操作按钮配置 */
export interface ActionConfig {
  label: string;
  targetStatus: CaseStatus;
  variant: ButtonVariant;
}

/* ========== Pure Functions ========== */

/**
 * 根据工单状态、用户角色和身份，返回可用的操作按钮列表。
 *
 * 按钮映射表：
 * | 当前状态        | 角色/身份          | 按钮       | 目标状态        |
 * |-----------------|--------------------|------------|-----------------|
 * | OPENED          | DCR_HELPER/ADMIN   | 接单       | IN_PROGRESS     |
 * | OPENED          | 提交者             | 取消工单   | CLOSED          |
 * | IN_PROGRESS     | 处理者/ADMIN       | 请求补充   | NEED_MORE_INFO  |
 * | IN_PROGRESS     | 处理者/ADMIN       | 关闭工单   | CLOSED          |
 * | NEED_MORE_INFO  | 提交者/ADMIN       | 已补充信息 | IN_PROGRESS     |
 * | CLOSED          | —                  | 无按钮     | —               |
 */
export function getAvailableActions(
  status: CaseStatus,
  role: string,
  isSubmitter: boolean,
  isHandler: boolean,
): ActionConfig[] {
  const actions: ActionConfig[] = [];

  switch (status) {
    case "OPENED": {
      if (role === "DCR_HELPER" || role === "ADMIN" || role === "SUPER_ADMIN") {
        actions.push({
          label: "接单",
          targetStatus: "IN_PROGRESS",
          variant: "default",
        });
      }
      if (isSubmitter) {
        actions.push({
          label: "取消工单",
          targetStatus: "CLOSED",
          variant: "destructive",
        });
      }
      break;
    }
    case "IN_PROGRESS": {
      if (isHandler || role === "ADMIN" || role === "SUPER_ADMIN") {
        actions.push({
          label: "请求补充",
          targetStatus: "NEED_MORE_INFO",
          variant: "outline",
        });
        actions.push({
          label: "关闭工单",
          targetStatus: "CLOSED",
          variant: "destructive",
        });
      }
      break;
    }
    case "NEED_MORE_INFO": {
      if (isSubmitter || role === "ADMIN" || role === "SUPER_ADMIN") {
        actions.push({
          label: "已补充信息",
          targetStatus: "IN_PROGRESS",
          variant: "default",
        });
      }
      break;
    }
    case "CLOSED": {
      // 已关闭工单无操作按钮
      break;
    }
  }

  return actions;
}

/**
 * 判断当前工单状态是否允许发送消息。
 * IN_PROGRESS 和 NEED_MORE_INFO 状态始终允许。
 * OPENED 状态下，当 isSubmitter=true 时允许提交者补充信息。
 * CLOSED 状态始终禁止。
 */
export function canSendMessage(status: CaseStatus, isSubmitter?: boolean): boolean {
  if (status === "IN_PROGRESS" || status === "NEED_MORE_INFO") {
    return true;
  }
  if (status === "OPENED" && isSubmitter === true) {
    return true;
  }
  return false;
}


/**
 * 将日期字符串格式化为 `MM-DD HH:mm` 格式。
 */
export function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}-${day} ${hours}:${minutes}`;
}

/**
 * 判断消息是否为当前用户发送。
 */
export function isOwnMessage(senderId: string, currentUserId: string): boolean {
  return senderId === currentUserId;
}

/**
 * 格式化 Helper 工单计数，返回 `"N/M"` 格式。
 */
export function formatHelperCaseCount(active: number, max: number): string {
  return `${active}/${max}`;
}
