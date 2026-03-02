"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAvailableActions,
  type CaseStatus,
} from "@/lib/dcr-ui-helpers";

/* ========== Types ========== */

export interface CaseActionButtonsProps {
  caseId: string;
  status: CaseStatus;
  currentUserId: string;
  currentUserRole: string;
  submitterId: string;
  handlerId: string | null;
  onStatusChange: () => void;
}

/* ========== Component ========== */

export function CaseActionButtons({
  caseId,
  status,
  currentUserId,
  currentUserRole,
  submitterId,
  handlerId,
  onStatusChange,
}: CaseActionButtonsProps) {
  const [loading, setLoading] = useState(false);

  const isSubmitter = currentUserId === submitterId;
  const isHandler = handlerId !== null && currentUserId === handlerId;

  const actions = getAvailableActions(
    status,
    currentUserRole,
    isSubmitter,
    isHandler,
  );

  if (actions.length === 0) return null;

  async function handleAction(targetStatus: CaseStatus) {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error ?? "操作失败，请稍后重试";
        alert(msg);
        return;
      }

      onStatusChange();
    } catch {
      alert("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="工单操作">
      {actions.map((action) => (
        <Button
          key={action.targetStatus}
          variant={action.variant}
          size="sm"
          disabled={loading}
          onClick={() => handleAction(action.targetStatus)}
        >
          {loading && (
            <Loader2
              className="mr-1 h-4 w-4 animate-spin"
              aria-hidden="true"
            />
          )}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
