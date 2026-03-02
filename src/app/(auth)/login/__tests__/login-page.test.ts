import { describe, it, expect } from "vitest";
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
  smsPhone: arbNonEmptyStr,
  smsCode: arbNonEmptyStr,
  smsErrors: arbErrorRecord,
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
        expect(result.formState.smsPhone).toBe("");
        expect(result.formState.smsCode).toBe("");
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
        expect(Object.keys(result.formState.smsErrors)).toHaveLength(0);
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
  it("should contain exactly email, password, sms", () => {
    expect(LOGIN_TABS).toEqual(["email", "password", "sms"]);
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
      smsPhone: "",
      smsCode: "",
      smsErrors: {},
      errorMessage: "",
    });
  });

  it("should return a new object each time (not shared reference)", () => {
    const a = getEmptyFormState();
    const b = getEmptyFormState();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.pwErrors).not.toBe(b.pwErrors);
    expect(a.smsErrors).not.toBe(b.smsErrors);
  });
});

describe("computeTabChangeState", () => {
  it("should set activeTab to the new tab", () => {
    const dirty: LoginFormState = {
      email: "a@b.com",
      pwEmail: "x@y.com",
      pwPassword: "secret",
      pwErrors: { email: "bad" },
      smsPhone: "13800138000",
      smsCode: "123456",
      smsErrors: { phone: "invalid" },
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
      smsPhone: "13912345678",
      smsCode: "654321",
      smsErrors: { code: "wrong code" },
      errorMessage: "login failed",
    };

    const result = computeTabChangeState(dirty, "sms");
    const empty = getEmptyFormState();
    expect(result.formState).toEqual(empty);
  });
});
