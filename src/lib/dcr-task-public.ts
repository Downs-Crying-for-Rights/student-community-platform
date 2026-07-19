export interface PublicDcrTaskCopy {
  title: string;
  summary: string;
  expectedHelpType: string;
}

const PUBLIC_TASK_COPY: Record<string, PublicDcrTaskCopy> = {
  TUTORING: {
    title: "补课相关互助委托",
    summary: "一份已通过管理员审核的补课相关委托，具体信息仅向参与者开放。",
    expectedHelpType: "协助核实情况并提供合规互助",
  },
  FEES: {
    title: "收费相关互助委托",
    summary: "一份已通过管理员审核的收费相关委托，具体信息仅向参与者开放。",
    expectedHelpType: "协助核实收费情况并提供合规互助",
  },
  WEEKENDS: {
    title: "休息安排相关互助委托",
    summary: "一份已通过管理员审核的休息安排相关委托，具体信息仅向参与者开放。",
    expectedHelpType: "协助核实安排并提供合规互助",
  },
  OTHER: {
    title: "校园事务互助委托",
    summary: "一份已通过管理员审核的校园事务委托，具体信息仅向参与者开放。",
    expectedHelpType: "协助核实情况并提供合规互助",
  },
};

export function getPublicDcrTaskCopy(category: string): PublicDcrTaskCopy {
  return PUBLIC_TASK_COPY[category] ?? PUBLIC_TASK_COPY.OTHER;
}
