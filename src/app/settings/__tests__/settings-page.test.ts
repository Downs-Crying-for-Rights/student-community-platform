import { describe, it, expect } from "vitest";

/**
 * 个人设置页面逻辑测试
 *
 * 验证个人设置页面的核心验证逻辑：
 * - 昵称验证（长度、字符规则）
 * - 头像 URL 验证
 * - 简介验证（长度限制）
 * - 表单整体验证
 * - 错误检测辅助函数
 * - 更新 payload 构建（仅包含变更字段）
 *
 * Validates: Requirements 2.1, 2.2, 24.1
 */

import {
  validateNickname,
  validateAvatarUrl,
  validateBio,
  validateProfileForm,
  hasErrors,
  buildUpdatePayload,
  type ProfileFormData,
} from "../profile/page";

/* ---------- validateNickname ---------- */

describe("validateNickname", () => {
  it("空字符串返回 undefined（可选字段）", () => {
    expect(validateNickname("")).toBeUndefined();
  });

  it("有效中文昵称通过验证", () => {
    expect(validateNickname("测试用户")).toBeUndefined();
  });

  it("有效英文昵称通过验证", () => {
    expect(validateNickname("test_user-1")).toBeUndefined();
  });

  it("少于 2 个字符返回错误", () => {
    expect(validateNickname("a")).toBe("昵称至少 2 个字符");
  });

  it("超过 20 个字符返回错误", () => {
    expect(validateNickname("a".repeat(21))).toBe("昵称不能超过 20 个字符");
  });

  it("包含特殊字符返回错误", () => {
    expect(validateNickname("test@user")).toBe(
      "昵称只能包含中文、英文、数字、下划线和连字符"
    );
  });

  it("包含空格返回错误", () => {
    expect(validateNickname("test user")).toBe(
      "昵称只能包含中文、英文、数字、下划线和连字符"
    );
  });

  it("恰好 2 个字符通过验证", () => {
    expect(validateNickname("ab")).toBeUndefined();
  });

  it("恰好 20 个字符通过验证", () => {
    expect(validateNickname("a".repeat(20))).toBeUndefined();
  });
});

/* ---------- validateAvatarUrl ---------- */

describe("validateAvatarUrl", () => {
  it("空字符串返回 undefined（可选字段）", () => {
    expect(validateAvatarUrl("")).toBeUndefined();
  });

  it("有效 URL 通过验证", () => {
    expect(validateAvatarUrl("https://example.com/avatar.jpg")).toBeUndefined();
  });

  it("无效 URL 返回错误", () => {
    expect(validateAvatarUrl("not-a-url")).toBe("请输入有效的头像 URL");
  });

  it("http URL 通过验证", () => {
    expect(validateAvatarUrl("http://example.com/img.png")).toBeUndefined();
  });
});

/* ---------- validateBio ---------- */

describe("validateBio", () => {
  it("空字符串通过验证", () => {
    expect(validateBio("")).toBeUndefined();
  });

  it("200 字符以内通过验证", () => {
    expect(validateBio("这是一段简介")).toBeUndefined();
  });

  it("恰好 200 字符通过验证", () => {
    expect(validateBio("a".repeat(200))).toBeUndefined();
  });

  it("超过 200 字符返回错误", () => {
    expect(validateBio("a".repeat(201))).toBe("个人简介不能超过 200 个字符");
  });
});

/* ---------- validateProfileForm ---------- */

describe("validateProfileForm", () => {
  it("全部有效数据返回空错误对象", () => {
    const data: ProfileFormData = {
      nickname: "测试用户",
      avatar: "https://example.com/avatar.jpg",
      bio: "一段简介",
    };
    expect(validateProfileForm(data)).toEqual({});
  });

  it("全部为空返回空错误对象（均为可选）", () => {
    const data: ProfileFormData = { nickname: "", avatar: "", bio: "" };
    expect(validateProfileForm(data)).toEqual({});
  });

  it("多个字段无效时返回多个错误", () => {
    const data: ProfileFormData = {
      nickname: "a",
      avatar: "bad-url",
      bio: "x".repeat(201),
    };
    const errors = validateProfileForm(data);
    expect(errors.nickname).toBeDefined();
    expect(errors.avatar).toBeDefined();
    expect(errors.bio).toBeDefined();
  });
});

/* ---------- hasErrors ---------- */

describe("hasErrors", () => {
  it("空对象返回 false", () => {
    expect(hasErrors({})).toBe(false);
  });

  it("有错误时返回 true", () => {
    expect(hasErrors({ nickname: "错误" })).toBe(true);
  });
});

/* ---------- buildUpdatePayload ---------- */

describe("buildUpdatePayload", () => {
  const original: ProfileFormData = {
    nickname: "原始昵称",
    avatar: "https://example.com/old.jpg",
    bio: "原始简介",
  };

  it("无变更返回空对象", () => {
    expect(buildUpdatePayload(original, original)).toEqual({});
  });

  it("仅昵称变更时只包含 nickname", () => {
    const form = { ...original, nickname: "新昵称" };
    expect(buildUpdatePayload(form, original)).toEqual({ nickname: "新昵称" });
  });

  it("多个字段变更时包含所有变更", () => {
    const form: ProfileFormData = {
      nickname: "新昵称",
      avatar: "https://example.com/new.jpg",
      bio: "新简介",
    };
    const payload = buildUpdatePayload(form, original);
    expect(payload).toEqual({
      nickname: "新昵称",
      avatar: "https://example.com/new.jpg",
      bio: "新简介",
    });
  });

  it("仅 bio 变更时只包含 bio", () => {
    const form = { ...original, bio: "更新的简介" };
    expect(buildUpdatePayload(form, original)).toEqual({ bio: "更新的简介" });
  });
});
