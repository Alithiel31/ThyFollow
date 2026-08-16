-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'GOOGLE_HEALTH');

-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN     "heartRateSource" "DataSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sleepHoursSource" "DataSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "weightSource" "DataSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "google_health_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "webhookSubscriptionId" TEXT,

    CONSTRAINT "google_health_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_health_connections_userId_key" ON "google_health_connections"("userId");

-- AddForeignKey
ALTER TABLE "google_health_connections" ADD CONSTRAINT "google_health_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
