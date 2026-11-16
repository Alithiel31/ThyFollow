-- Historique de posologie : une ligne par dose, datée de son entrée en vigueur.
-- Medication.dosage / dosageUnit restent la valeur courante (aucune rupture d'API).

-- CreateTable
CREATE TABLE "medication_dose_changes" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "dosage" DOUBLE PRECISION NOT NULL,
    "dosageUnit" "DosageUnit" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_dose_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medication_dose_changes_medicationId_idx" ON "medication_dose_changes"("medicationId");

-- CreateIndex
CREATE UNIQUE INDEX "medication_dose_changes_medicationId_effectiveFrom_key" ON "medication_dose_changes"("medicationId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "medication_dose_changes" ADD CONSTRAINT "medication_dose_changes_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise de l'existant : chaque médicament déjà saisi reçoit une première ligne
-- à sa dose courante, en vigueur depuis sa date de début de traitement.
-- gen_random_uuid() est natif depuis PostgreSQL 13 ; l'application génère des cuid
-- pour les lignes suivantes, les deux formats cohabitent dans la colonne TEXT.
INSERT INTO "medication_dose_changes" ("id", "medicationId", "dosage", "dosageUnit", "effectiveFrom", "createdAt")
SELECT gen_random_uuid()::text, "id", "dosage", "dosageUnit", "startDate"::date, "createdAt"
FROM "medications";
