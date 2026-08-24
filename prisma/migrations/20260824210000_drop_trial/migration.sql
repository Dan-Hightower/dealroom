-- Everyone brings their own keys. There is no shared allowance to borrow, so
-- there is nothing for a mode or a trial token to select between.

ALTER TABLE "user_credentials" DROP COLUMN "mode";
ALTER TABLE "user_credentials" DROP COLUMN "trialToken";

DROP TYPE "ChatCredentialMode";
