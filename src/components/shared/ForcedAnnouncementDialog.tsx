"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SafeMarkdown } from "@/components/shared/SafeMarkdown";
import { announcementStorageKey } from "@/lib/announcement";

interface AnnouncementDto {
  id: string;
  title: string;
  content: string;
  revision: number;
}

export function ForcedAnnouncementDialog() {
  const { status } = useSession();
  const [announcement, setAnnouncement] = useState<AnnouncementDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    fetch("/api/announcements/current", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { announcement: null })
      .then((data) => {
        if (cancelled || !data.announcement) return;
        const current = data.announcement as AnnouncementDto;
        if (status === "unauthenticated") {
          try {
            if (localStorage.getItem(announcementStorageKey(current.id, current.revision))) return;
          } catch {
            // Storage can be unavailable in restricted browser contexts.
          }
        }
        setAnnouncement(current);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [status]);

  async function dismiss() {
    if (!announcement) return;
    setSaving(true);
    setError("");
    if (status === "unauthenticated") {
      try {
        localStorage.setItem(announcementStorageKey(announcement.id, announcement.revision), "1");
      } catch {
        // The current page can still acknowledge the announcement in memory.
      }
      setAnnouncement(null);
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/announcements/${encodeURIComponent(announcement.id)}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: announcement.revision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "确认失败，请重试");
        return;
      }
      setAnnouncement(null);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(announcement)}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[85vh] max-w-xl overflow-y-auto"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{announcement?.title ?? "平台公告"}</DialogTitle>
        </DialogHeader>
        <SafeMarkdown content={announcement?.content ?? ""} />
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button onClick={() => void dismiss()} disabled={saving} className="w-full">
          {saving ? "确认中..." : "我已阅读并确认"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
