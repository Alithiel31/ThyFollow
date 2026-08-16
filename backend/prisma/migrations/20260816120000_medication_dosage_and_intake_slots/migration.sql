-- CreateEnum
CREATE TYPE "DosageUnit" AS ENUM ('MCG', 'MG', 'IU', 'TABLET', 'DROP', 'ML', 'OTHER');

-- dosageMcg -> dosage (simple rename, preserves existing values)
ALTER TABLE "medications" RENAME COLUMN "dosageMcg" TO "dosage";

-- new unit column ; toutes les prises existantes étaient implicitement en µg
ALTER TABLE "medications" ADD COLUMN "dosageUnit" "DosageUnit" NOT NULL DEFAULT 'MCG';

-- intakeTime (single) -> intakeTimes (array) ; on migre la valeur avant de supprimer la colonne
ALTER TABLE "medications" ADD COLUMN "intakeTimes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "medications" SET "intakeTimes" = ARRAY["intakeTime"] WHERE "intakeTime" IS NOT NULL;
ALTER TABLE "medications" DROP COLUMN "intakeTime";

-- CreateTable
CREATE TABLE "medication_intakes" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medication_intakes_medicationId_date_time_key" ON "medication_intakes"("medicationId", "date", "time");

-- AddForeignKey
ALTER TABLE "medication_intakes" ADD CONSTRAINT "medication_intakes_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
