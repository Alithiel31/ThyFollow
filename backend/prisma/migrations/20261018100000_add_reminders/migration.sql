-- Rappels par email désactivés par défaut (opt-in). Aucune ligne n'était créée
-- par l'application jusqu'ici : les lignes existantes (seed) sont remises à false.
ALTER TABLE "notification_settings" ALTER COLUMN "dailyLogReminder" SET DEFAULT false,
ALTER COLUMN "medicationReminder" SET DEFAULT false,
ALTER COLUMN "labResultReminder" SET DEFAULT false,
ALTER COLUMN "appointmentReminder" SET DEFAULT false,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'fr';

UPDATE "notification_settings"
SET "dailyLogReminder" = false, "medicationReminder" = false, "labResultReminder" = false, "appointmentReminder" = false;

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_logs_sentAt_idx" ON "reminder_logs"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_logs_userId_key_key" ON "reminder_logs"("userId", "key");

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
