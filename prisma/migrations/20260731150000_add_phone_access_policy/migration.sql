ALTER TABLE "SystemConfig"
ADD COLUMN "emailRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "inviteRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "qqRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "registrationPhoneRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "phoneRequiredAreas" JSONB NOT NULL DEFAULT '{}';
