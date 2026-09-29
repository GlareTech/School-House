ALTER TABLE "SignupIntent" ADD COLUMN "acceptedTermsAt" TIMESTAMP(3);
UPDATE "SignupIntent" SET "acceptedTermsAt" = "createdAt" WHERE "acceptedTermsAt" IS NULL;
ALTER TABLE "SignupIntent" ALTER COLUMN "acceptedTermsAt" SET NOT NULL;
