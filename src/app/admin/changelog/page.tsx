"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHANGELOG } from "@/lib/changelog";

export default function AdminChangelogPage() {
  const [deployedVersion, setDeployedVersion] = useState("");

  useEffect(() => {
    fetch(`/VERSION?t=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.text() : "")
      .then((version) => setDeployedVersion(version.trim()))
      .catch(() => undefined);
  }, []);

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">更新日志</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          当前部署版本：{deployedVersion ? `v${deployedVersion}` : "读取中..."}
        </p>
      </div>

      <div className="space-y-4">
        {CHANGELOG.map((entry, index) => (
          <Card key={entry.version} className={index === 0 ? "border-primary/40" : undefined}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">v{entry.version} · {entry.title}</CardTitle>
                <time className="text-xs text-muted-foreground" dateTime={entry.date}>{entry.date}</time>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                {entry.changes.map((change) => <li key={change}>• {change}</li>)}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
