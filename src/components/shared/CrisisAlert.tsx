"use client";

import { Heart, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface CrisisResource {
  name: string;
  phone: string;
  description?: string;
}

const DEFAULT_RESOURCES: CrisisResource[] = [
  {
    name: "全国心理援助热线",
    phone: "400-161-9995",
    description: "24 小时免费心理危机干预热线",
  },
  {
    name: "北京心理危机研究与干预中心",
    phone: "010-82951332",
    description: "24 小时心理危机干预",
  },
  {
    name: "希望 24 热线",
    phone: "400-161-9995",
    description: "全天候生命热线",
  },
];

export interface CrisisAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override default crisis resources */
  resources?: CrisisResource[];
  className?: string;
}

export function CrisisAlert({
  open,
  onOpenChange,
  resources = DEFAULT_RESOURCES,
  className,
}: CrisisAlertProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", className)}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40">
            <Heart className="h-6 w-6 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">
            你并不孤单
          </DialogTitle>
          <DialogDescription className="text-center">
            如果你正在经历困难，请联系以下专业资源获取帮助。必要时请联系可信成人或拨打心理援助热线。
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2" role="list">
          {resources.map((r) => (
            <li
              key={r.phone}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm">{r.name}</p>
                {r.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {r.description}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="ml-3 shrink-0 gap-1"
                asChild
              >
                <a href={`tel:${r.phone}`} aria-label={`拨打 ${r.name} ${r.phone}`}>
                  <Phone className="h-3.5 w-3.5" />
                  {r.phone}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
