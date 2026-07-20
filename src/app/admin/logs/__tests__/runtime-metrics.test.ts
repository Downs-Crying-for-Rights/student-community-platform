import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("系统日志运行状态", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/admin/logs/page.tsx"), "utf8");

  it("提供服务器运行状态栏目和实时指标接口", () => {
    expect(source).toContain('TabsTrigger value="runtime"');
    expect(source).toContain('/api/admin/system/metrics');
    expect(source).toContain("进程 CPU");
    expect(source).toContain("容器可见值");
  });

  it("每五秒刷新、后台页面暂停且不误称公网 IP", () => {
    expect(source).toContain("5000");
    expect(source).toContain('document.visibilityState === "visible"');
    expect(source).toContain("不等同于公网 IP");
  });
});
