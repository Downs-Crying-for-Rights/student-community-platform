import prisma from "@/lib/prisma";
import {
  DEFAULT_REGISTRATION_ACCESS_POLICY,
  parsePhoneRequiredAreas,
  type PhoneGateArea,
} from "@/lib/phone-policy-shared";

export async function getSmsVerificationEnabled(): Promise<boolean> {
  const config = await prisma.systemConfig.findUnique({
    where: { id: "default" },
    select: { smsVerificationEnabled: true },
  });
  return config?.smsVerificationEnabled ?? true;
}

export async function getSystemAccessPolicy() {
  // Some isolated route tests provide a minimal Prisma mock without this model.
  // Treat that the same as a database with no SystemConfig row.
  if (!prisma.systemConfig) {
    return {
      registration: { ...DEFAULT_REGISTRATION_ACCESS_POLICY },
      phoneRequiredAreas: parsePhoneRequiredAreas(null),
    };
  }
  const config = await prisma.systemConfig.findUnique({
    where: { id: "default" },
    select: {
      emailRegistrationEnabled: true,
      inviteRegistrationEnabled: true,
      qqRegistrationEnabled: true,
      registrationPhoneRequired: true,
      phoneRequiredAreas: true,
    },
  });

  return {
    registration: config ? {
      emailEnabled: config.emailRegistrationEnabled,
      inviteEnabled: config.inviteRegistrationEnabled,
      qqEnabled: config.qqRegistrationEnabled,
      phoneRequired: config.registrationPhoneRequired,
    } : { ...DEFAULT_REGISTRATION_ACCESS_POLICY },
    phoneRequiredAreas: parsePhoneRequiredAreas(config?.phoneRequiredAreas),
  };
}

export async function isPhoneRequiredForArea(area: PhoneGateArea): Promise<boolean> {
  const policy = await getSystemAccessPolicy();
  return policy.phoneRequiredAreas[area];
}
