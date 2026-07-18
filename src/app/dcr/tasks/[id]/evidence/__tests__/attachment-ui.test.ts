import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("证据区附件", () => {
  it("通过 multipart 上传附件并从鉴权下载接口打开", () => {
    const page = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

    expect(page).toContain('formData.append("file", formFile)');
    expect(page).toContain("附件（可选，最大 20MB）");
    expect(page).toContain("/evidence/${item.id}/url");
    expect(page).not.toContain("item.fileUrl}");
  });
});
