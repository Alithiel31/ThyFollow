-- Séparé de la migration précédente : une valeur d'enum ajoutée par
-- ALTER TYPE ... ADD VALUE ne peut pas être utilisée dans la même transaction.
-- Les bilans déjà importés depuis un PDF (rattachés à un document) passent en PDF_IMPORT.
UPDATE "lab_results" SET "source" = 'PDF_IMPORT'
WHERE "id" IN (SELECT "labResultId" FROM "lab_documents" WHERE "labResultId" IS NOT NULL);
