"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHANGELOG } from "@/lib/changelog";
import { GIT_HISTORY, GIT_HISTORY_SOURCE_COMMIT } from "@/lib/git-history.generated";

const TYPE_LABELS: Readonly<Record<string, string>> = {
  feat: "功能", fix: "修复", test: "测试", ci: "CI", build: "版本", docs: "文档",
  refactor: "重构", chore: "维护", perf: "性能", revert: "回退", merge: "合并", other: "其他",
};

const TIMELINE_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Shanghai",
});

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

      <section className="space-y-4" aria-labelledby="git-timeline-title">
        <div>
          <h2 id="git-timeline-title" className="text-xl font-bold">完整 Git 时间线</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {GIT_HISTORY.length} 个唯一提交，按最早到最新排列；快照截止 {GIT_HISTORY_SOURCE_COMMIT.slice(0, 7)}。
          </p>
        </div>
        <div className="relative border-l border-border pl-5">
          {GIT_HISTORY.map((commit) => (
            <article key={commit.hash} className="relative pb-5 last:pb-0">
              <span className="absolute -left-[25px] top-2 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
              <div className="rounded-lg border bg-card px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <time dateTime={commit.committedAt}>{TIMELINE_DATE_FORMATTER.format(new Date(commit.committedAt))}</time>
                  <code className="rounded bg-muted px-1.5 py-0.5">{commit.shortHash}</code>
                  <span className="rounded-full bg-muted px-2 py-0.5">{TYPE_LABELS[commit.type] || commit.type}</span>
                  {commit.version && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">v{commit.version}</span>}
                </div>
                <p className="mt-2 text-sm font-medium leading-6">{commit.subject}</p>
                <p className="mt-1 text-xs text-muted-foreground">{commit.authorName}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
