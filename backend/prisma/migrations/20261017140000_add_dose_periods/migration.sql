-- AlterTable
ALTER TABLE "medications" ADD COLUMN     "showOnChart" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "dose_periods" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "slots" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dose_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dose_periods_medicationId_startDate_key" ON "dose_periods"("medicationId", "startDate");

-- AddForeignKey
ALTER TABLE "dose_periods" ADD CONSTRAINT "dose_periods_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────
-- Conversion des médicaments existants : une période de posologie chacun.
-- L'ancien "dosage" est une dose par prise ; chaque heure de "intakeTimes" devient un créneau
-- portant le cycle déduit de "frequency". Sans heure, un seul créneau { time: null }.
-- ─────────────────────────────────────────────
WITH cycles AS (
  SELECT
    m.id,
    m."startDate",
    CASE m.frequency
      WHEN 'EVERY_OTHER_DAY' THEN jsonb_build_array(m.dosage, 0)
      WHEN 'WEEKLY' THEN jsonb_build_array(m.dosage, 0, 0, 0, 0, 0, 0)
      ELSE jsonb_build_array(m.dosage)
    END AS doses
  FROM "medications" m
),
times AS (
  -- heures distinctes, dans l'ordre de première apparition
  SELECT t."medicationId", t.time, MIN(t.ord) AS ord
  FROM (
    SELECT m.id AS "medicationId", u.time, u.ord
    FROM "medications" m, unnest(m."intakeTimes") WITH ORDINALITY AS u(time, ord)
  ) t
  GROUP BY t."medicationId", t.time
)
INSERT INTO "dose_periods" ("id", "medicationId", "startDate", "slots")
SELECT
  gen_random_uuid()::text,
  c.id,
  c."startDate"::date,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('time', t.time, 'doses', c.doses) ORDER BY t.ord)
       FROM times t WHERE t."medicationId" = c.id),
    jsonb_build_array(jsonb_build_object('time', NULL, 'doses', c.doses))
  )
FROM cycles c;

-- "dosage" devient la dose moyenne quotidienne totale (tous créneaux additionnés).
UPDATE "medications" m
SET "dosage" = m."dosage"
  * GREATEST(cardinality(ARRAY(SELECT DISTINCT unnest(m."intakeTimes"))), 1)
  / CASE m.frequency WHEN 'EVERY_OTHER_DAY' THEN 2 WHEN 'WEEKLY' THEN 7 ELSE 1 END;

UPDATE "medications" SET "showOnChart" = true WHERE "dosageUnit" = 'MCG';

-- La cadence est désormais portée par les cycles ; seul "au besoin" reste distinct.
UPDATE "medications" SET "frequency" = 'DAILY' WHERE "frequency" <> 'AS_NEEDED';
