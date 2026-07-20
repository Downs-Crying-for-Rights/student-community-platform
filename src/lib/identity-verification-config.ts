export interface IdentityVerificationConfig {
  encryptionKey: Buffer;
  hmacKey: Buffer;
  keyVersion: number;
}

function parseKey(value: string | undefined, name: string): Buffer {
  if (!value) throw new Error(`IDENTITY_VERIFICATION_MISSING_${name}`);
  const encoding = /^[0-9a-f]{64}$/i.test(value) ? "hex" : "base64url";
  const key = Buffer.from(value, encoding);
  if (key.length !== 32) throw new Error(`IDENTITY_VERIFICATION_INVALID_${name}`);
  return key;
}

export function getIdentityVerificationConfig(requestedVersion?: number): IdentityVerificationConfig {
  const currentVersion = Number(process.env.IDENTITY_VERIFICATION_KEY_VERSION || "1");
  const version = requestedVersion ?? currentVersion;
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("IDENTITY_VERIFICATION_INVALID_KEY_VERSION");
  return {
    encryptionKey: parseKey(
      process.env[`IDENTITY_VERIFICATION_ENCRYPTION_KEY_V${version}`]
        || (version === currentVersion - 1 ? process.env.IDENTITY_VERIFICATION_PREVIOUS_ENCRYPTION_KEY : undefined)
        || (version === currentVersion ? process.env.IDENTITY_VERIFICATION_ENCRYPTION_KEY : undefined),
      `ENCRYPTION_KEY_V${version}`,
    ),
    hmacKey: parseKey(process.env.IDENTITY_VERIFICATION_HMAC_KEY, "HMAC_KEY"),
    keyVersion: version,
  };
}
