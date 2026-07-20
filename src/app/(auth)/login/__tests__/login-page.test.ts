import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as fc from "fast-check";

// Feature: multi-auth-login, Property 13: 标签页切换清空表单状态
// **Validates: Requirements 7.4**

import {
  type LoginTab,
  type LoginFormState,
  LOGIN_TABS,
  getEmptyFormState,
  computeTabChangeState,
} from "../page";

// ==================== Generators ====================

/** Generate a random LoginTab */
const arbTab = fc.constantFrom<LoginTab>(...LOGIN_TABS);

/** Generate a pair of distinct tabs (from, to) where from !== to */
const arbTabPair = fc
  .tuple(arbTab, arbTab)
  .filter(([from, to]) => from !== to);

/** Generate a non-empty arbitrary string for form fields */
const arbNonEmptyStr = fc.string({ minLength: 1, maxLength: 50 });

/** Generate a random Record<string, string> with at least one entry (for error maps) */
const arbErrorRecord = fc
  .dictionary(
    fc.string({ minLength: 1, maxLength: 10 }),
    fc.string({ minLength: 1, maxLength: 50 }),
    { minKeys: 1, maxKeys: 3 },
  );

/** Generate a random LoginFormState with non-empty values */
const arbDirtyFormState: fc.Arbitrary<LoginFormState> = fc.record({
  email: arbNonEmptyStr,
  pwEmail: arbNonEmptyStr,
  pwPassword: arbNonEmptyStr,
  pwErrors: arbErrorRecord,
  errorMessage: arbNonEmptyStr,
});

// ==================== Property 13 ====================

describe("属性 13: 标签页切换清空表单状态", () => {
  it("切换标签页后所有表单输入值应被清空", () => {
    fc.assert(
      fc.property(arbDirtyFormState, arbTabPair, (dirtyState, [_fromTab, toTab]) => {
        const result = computeTabChangeState(dirtyState, toTab);

        // All form values must be empty strings
        expect(result.formState.email).toBe("");
        expect(result.formState.pwEmail).toBe("");
        expect(result.formState.pwPassword).toBe("");
        expect(result.formState.errorMessage).toBe("");
      }),
      { numRuns: 100 },
    );
  });

  it("切换标签页后所有错误提示应被清空", () => {
    fc.assert(
      fc.property(arbDirtyFormState, arbTabPair, (dirtyState, [_fromTab, toTab]) => {
        const result = computeTabChangeState(dirtyState, toTab);

        // Error records must be empty objects
        expect(Object.keys(result.formState.pwErrors)).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it("切换标签页后 activeTab 应等于目标标签页", () => {
    fc.assert(
      fc.property(arbDirtyFormState, arbTabPair, (dirtyState, [_fromTab, toTab]) => {
        const result = computeTabChangeState(dirtyState, toTab);
        expect(result.activeTab).toBe(toTab);
      }),
      { numRuns: 100 },
    );
  });

  it("切换后的表单状态应等于空状态", () => {
    fc.assert(
      fc.property(arbDirtyFormState, arbTabPair, (dirtyState, [_fromTab, toTab]) => {
        const result = computeTabChangeState(dirtyState, toTab);
        const emptyState = getEmptyFormState();

        expect(result.formState).toEqual(emptyState);
      }),
      { numRuns: 100 },
    );
  });

  it("无论原始状态多脏，切换后结果始终一致", () => {
    fc.assert(
      fc.property(
        arbDirtyFormState,
        arbDirtyFormState,
        arbTab,
        (state1, state2, toTab) => {
          const result1 = computeTabChangeState(state1, toTab);
          const result2 = computeTabChangeState(state2, toTab);

          // Regardless of previous state, the cleared state is always the same
          expect(result1.formState).toEqual(result2.formState);
          expect(result1.activeTab).toBe(result2.activeTab);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Unit Tests ====================
// Feature: multi-auth-login, Unit Tests for 登录页面
// **Validates: Requirements 7.1, 7.2, 7.3, 7.5**

describe("LOGIN_TABS", () => {
  it("should contain exactly email and password", () => {
    expect(LOGIN_TABS).toEqual(["email", "password"]);
  });
});

describe("getEmptyFormState", () => {
  it("should return all empty strings and empty objects", () => {
    const state = getEmptyFormState();
    expect(state).toEqual({
      email: "",
      pwEmail: "",
      pwPassword: "",
      pwErrors: {},
      errorMessage: "",
    });
  });

  it("should return a new object each time (not shared reference)", () => {
    const a = getEmptyFormState();
    const b = getEmptyFormState();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.pwErrors).not.toBe(b.pwErrors);
  });
});

describe("computeTabChangeState", () => {
  it("should set activeTab to the new tab", () => {
    const dirty: LoginFormState = {
      email: "a@b.com",
      pwEmail: "x@y.com",
      pwPassword: "secret",
      pwErrors: { email: "bad" },
      errorMessage: "something went wrong",
    };

    for (const tab of LOGIN_TABS) {
      const result = computeTabChangeState(dirty, tab);
      expect(result.activeTab).toBe(tab);
    }
  });

  it("should clear all form fields regardless of input", () => {
    const dirty: LoginFormState = {
      email: "user@example.com",
      pwEmail: "pw@example.com",
      pwPassword: "p@ssw0rd!",
      pwErrors: { email: "invalid email" },
      errorMessage: "login failed",
    };

    const result = computeTabChangeState(dirty, "email");
    const empty = getEmptyFormState();
    expect(result.formState).toEqual(empty);
  });
});

describe("注册方式分流", () => {
  it("邀请码注册复用普通注册字段且只增加邀请码输入框", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    expect(source).toContain("QQ 机器人验证");
    expect(source).toContain('id="reg-invite-code"');
    expect(source).toContain('id="reg-phone"');
    expect(source).toContain('id="reg-sms-code"');
    expect(source).toContain('showInvite ? "/api/auth/invite" : "/api/auth/register"');
    expect(source).toContain('fetch("/api/auth/register/qq"');
    expect(source).toContain('body: JSON.stringify({ credential: qqRegistration.credential })');
    expect(source).toContain("指令不含密码");
    expect(source).not.toContain('id="invite-phone"');
    expect(source).not.toContain('id="invite-sms-code"');
    expect(source).not.toContain('id="invite-nickname"');
    expect(source).not.toContain('id="invite-email"');
    expect(source).not.toContain('id="invite-password"');
  });

  it("QQ 机器人注册只发送一次性凭据且支持用户名登录", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    expect(source).toContain("qqRegistration.command");
    expect(source).toContain('identifier: regNickname.trim()');
    expect(source).toContain("凭据 15 分钟内有效");
    expect(source).not.toContain('`注册 ${regPassword}`');
  });

  it("注册页不展示私信和群聊的使用时授权协议", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

    expect(source).toContain("REGISTRATION_POLICY_KEYS.includes");
  });
});

describe("登录协议与品牌", () => {
  it("密码登录提示支持邮箱、用户名或手机号", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

    expect(source).toContain("邮箱、用户名或手机号");
    expect(source).toContain('identifier: pwEmail.trim()');
  });

  it("所有登录方式共享协议勾选并在弹窗中阅读协议", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

    expect(source).toContain('id="login-agreement"');
    expect(source).toContain("!loginAgreementAccepted");
    expect(source).toContain('openLoginPolicy("user-agreement")');
    expect(source).toContain('openLoginPolicy("privacy-policy")');
    expect(source).not.toContain('href="/help/policies?document=user-agreement"');
    expect(source).not.toContain('href="/help/policies?document=privacy-policy"');
  });

  it("不提供手机号验证码登录入口或服务端 Provider", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    expect(source).not.toContain("手机号登录");
    expect(source).not.toContain('signIn("credentials-sms"');
    expect(source).not.toContain('purpose: "login"');
  });

  it("登录和注册使用正式站名学互会", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

    expect(source).toContain("登录学互会");
    expect(source).toContain("注册学互会");
    expect(source).not.toContain("登录学生交流社区");
  });
});

describe("忘记密码", () => {
  it("密码登录页提供手机号验证码重置入口", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    expect(source).toContain("忘记密码？");
    expect(source).toContain('fetch("/api/auth/password/reset/send"');
    expect(source).toContain('fetch("/api/auth/password/reset"');
    expect(source).toContain("使用账户已绑定的手机号验证身份");
  });
});
