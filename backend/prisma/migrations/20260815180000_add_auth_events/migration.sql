-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LINKED', 'LINK_CONFLICT', 'LINK_FAILED', 'UNLINKED');

-- CreateTable
CREATE TABLE "auth_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "type" "AuthEventType" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_events_userId_createdAt_idx" ON "auth_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
