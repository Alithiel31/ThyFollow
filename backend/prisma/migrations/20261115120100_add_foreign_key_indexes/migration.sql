-- PostgreSQL n'indexe pas les clés étrangères : chaque lecture « par
-- utilisateur » de ces tables parcourait la table entière.

-- CreateIndex
CREATE INDEX "lab_results_userId_idx" ON "lab_results"("userId");

-- CreateIndex
CREATE INDEX "medications_userId_idx" ON "medications"("userId");

-- CreateIndex
CREATE INDEX "appointments_userId_idx" ON "appointments"("userId");

-- CreateIndex
CREATE INDEX "symptom_library_userId_idx" ON "symptom_library"("userId");

-- CreateIndex
CREATE INDEX "symptom_logs_entryId_idx" ON "symptom_logs"("entryId");

-- CreateIndex
CREATE INDEX "symptom_logs_symptomId_idx" ON "symptom_logs"("symptomId");

-- CreateIndex
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- CreateIndex
CREATE INDEX "promo_redemptions_userId_idx" ON "promo_redemptions"("userId");
