import { beforeEach, describe, expect, it } from "vitest";

import {
  decryptIdentityDetails,
  encryptIdentityDetails,
  grantsStudentVerification,
  hashVerifiedIdentity,
  isValidChineseId,
  maskChineseId,
  realNameIdentitySchema,
} from "./identity-verification";

describe("identity verification", () => {
  beforeEach(() => {
    process.env.IDENTITY_VERIFICATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    process.env.IDENTITY_VERIFICATION_HMAC_KEY = Buffer.alloc(32, 8).toString("base64url");
    process.env.IDENTITY_VERIFICATION_KEY_VERSION = "1";
  });

  it("validates the Chinese ID checksum and birth date", () => {
    expect(isValidChineseId("11010519491231002X")).toBe(true);
    expect(isValidChineseId("11010519491331002X")).toBe(false);
    expect(isValidChineseId("110105194912310021")).toBe(false);
  });

  it("encrypts identity details with application-bound authenticated encryption", () => {
    const encrypted = encryptIdentityDetails("application-1", "张三", "11010519491231002X");
    expect(encrypted.ciphertext).not.toContain("张三");
    expect(decryptIdentityDetails("application-1", encrypted)).toEqual({
      realName: "张三",
      idNumber: "11010519491231002X",
    });
    expect(() => decryptIdentityDetails("application-2", encrypted)).toThrow("ENVELOPE_DECRYPT_FAILED");
  });

  it("decrypts older records with a retained versioned key", () => {
    const encrypted = encryptIdentityDetails("application-1", "张三", "11010519491231002X");
    process.env.IDENTITY_VERIFICATION_ENCRYPTION_KEY_V1 = process.env.IDENTITY_VERIFICATION_ENCRYPTION_KEY;
    process.env.IDENTITY_VERIFICATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64url");
    process.env.IDENTITY_VERIFICATION_KEY_VERSION = "2";

    expect(decryptIdentityDetails("application-1", encrypted).realName).toBe("张三");
    delete process.env.IDENTITY_VERIFICATION_ENCRYPTION_KEY_V1;
  });

  it("uses a stable non-reversible lookup and masks display", () => {
    expect(hashVerifiedIdentity("11010519491231002x")).toBe(hashVerifiedIdentity(" 11010519491231002X "));
    expect(hashVerifiedIdentity("11010519491231002X")).not.toContain("110105");
    expect(maskChineseId("11010519491231002X")).toBe("110105********002X");
  });

  it("only photo methods grant the student tag", () => {
    expect(grantsStudentVerification("STUDENT_DOCUMENT")).toBe(true);
    expect(grantsStudentVerification("ID_HOLDING_PHOTO")).toBe(true);
    expect(grantsStudentVerification("SCHOOL_UNIFORM")).toBe(true);
    expect(grantsStudentVerification("REAL_NAME_ID")).toBe(false);
  });

  it("requires explicit privacy confirmation and a valid real identity", () => {
    expect(realNameIdentitySchema.safeParse({ realName: "张三", idNumber: "11010519491231002X", privacyConfirmed: true }).success).toBe(true);
    expect(realNameIdentitySchema.safeParse({ realName: "张三", idNumber: "11010519491231002X", privacyConfirmed: false }).success).toBe(false);
  });
});
