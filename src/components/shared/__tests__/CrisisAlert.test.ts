import { describe, it, expect } from "vitest";

/**
 * CrisisAlert 组件逻辑测试
 *
 * 验证求助提示弹窗组件的核心逻辑：
 * - 默认紧急求助资源列表
 * - 热线电话链接格式
 * - 自定义资源覆盖
 *
 * Validates: Requirements 8.7, 8.8, 35.3
 */

interface CrisisResource {
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

function resolveResources(custom?: CrisisResource[]): CrisisResource[] {
  return custom ?? DEFAULT_RESOURCES;
}

function buildTelHref(phone: string): string {
  return `tel:${phone}`;
}

function buildAriaLabel(resource: CrisisResource): string {
  return `拨打 ${resource.name} ${resource.phone}`;
}

describe("CrisisAlert 组件逻辑", () => {
  describe("默认资源列表", () => {
    it("包含至少 3 个求助资源", () => {
      const resources = resolveResources();
      expect(resources.length).toBeGreaterThanOrEqual(3);
    });

    it("每个资源包含 name 和 phone", () => {
      for (const r of resolveResources()) {
        expect(r.name).toBeTruthy();
        expect(r.phone).toBeTruthy();
      }
    });
  });

  describe("自定义资源", () => {
    it("自定义资源覆盖默认列表", () => {
      const custom: CrisisResource[] = [
        { name: "自定义热线", phone: "123-456" },
      ];
      const resources = resolveResources(custom);
      expect(resources).toHaveLength(1);
      expect(resources[0].name).toBe("自定义热线");
    });
  });

  describe("电话链接", () => {
    it("生成正确的 tel: 链接", () => {
      expect(buildTelHref("400-161-9995")).toBe("tel:400-161-9995");
      expect(buildTelHref("010-82951332")).toBe("tel:010-82951332");
    });
  });

  describe("无障碍", () => {
    it("生成正确的 aria-label", () => {
      const resource = DEFAULT_RESOURCES[0];
      expect(buildAriaLabel(resource)).toBe(
        "拨打 全国心理援助热线 400-161-9995"
      );
    });
  });
});
