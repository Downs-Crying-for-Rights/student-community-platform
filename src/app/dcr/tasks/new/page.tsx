import { redirect } from "next/navigation";

/**
 * 互助求助与 DCR 委托已合并为同一条审核流程。
 * 保留旧 URL，避免收藏、历史消息和外部链接失效。
 */
export default function NewTaskPage() {
  redirect("/dcr/delegate?source=task");
}
