-- The browser extension is gone; everything reaches its platform over an API
-- now, so what used to be a bearer token for the extension becomes a place to
-- keep each user's own API credentials.

DROP TABLE "extension_session";

CREATE TYPE "ChatCredentialMode" AS ENUM ('byok', 'trial');

CREATE TABLE "user_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "ChatCredentialMode" NOT NULL DEFAULT 'byok',
    "xClientId" TEXT,
    "xAccessToken" TEXT,
    "xRefreshToken" TEXT,
    "xTokenExpiresAt" TIMESTAMP(3),
    "xUserId" TEXT,
    "xUsername" TEXT,
    "xChatPin" TEXT,
    "xChatJuiceboxConfig" TEXT,
    "xaiApiKey" TEXT,
    "trialToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_credentials_userId_key" ON "user_credentials"("userId");

ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
