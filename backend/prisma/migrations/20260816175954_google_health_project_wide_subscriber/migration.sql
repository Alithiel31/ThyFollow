-- AlterTable
ALTER TABLE "google_health_connections" DROP COLUMN "webhookSubscriptionId",
DROP COLUMN "webhookChannelToken",
ADD COLUMN     "healthUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "google_health_connections_healthUserId_key" ON "google_health_connections"("healthUserId");
