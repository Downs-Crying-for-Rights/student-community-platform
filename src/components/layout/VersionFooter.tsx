"use client";

import { useEffect, useState } from "react";

/**
 * 页脚版本号组件
 *
 * 从静态构建资源 `/VERSION` 中读取版本号（Next.js public 目录），
 * 生成由 VERSION 文件和 GitHub Actions 控制。
 */
export function VersionFooter() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let deploymentId: string | null = null;

    const fetchUncachedText = (url: string) =>
      fetch(`${url}?t=${Date.now()}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.text() : null));

    fetchUncachedText("/VERSION")
      .then((text) => {
        if (active && text) setVersion(text.trim());
      })
      .catch(() => {});

    const checkDeployment = async () => {
      try {
        const text = await fetchUncachedText("/DEPLOYMENT");
        if (!active || !text) return;
        const nextId = text.trim();
        if (deploymentId && deploymentId !== nextId) {
          window.location.reload();
          return;
        }
        deploymentId = nextId;
      } catch {
        // A deployment may make the service briefly unavailable.
      }
    };

    void checkDeployment();
    const timer = window.setInterval(checkDeployment, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!version) return null;

  return (
    <footer className="text-center pb-20 lg:pb-6 pt-4">
      <p className="text-xs text-muted-foreground/50 select-none">
        v{version} · AI 生成内容仅供参考
      </p>
    </footer>
  );
}
