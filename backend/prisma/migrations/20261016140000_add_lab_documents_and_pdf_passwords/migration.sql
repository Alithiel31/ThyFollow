-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "aiExtractionConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "lab_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "labResultId" TEXT,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "dataEnc" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdf_passwords" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "pdf_passwords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_documents_labResultId_idx" ON "lab_documents"("labResultId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_documents_userId_sha256_key" ON "lab_documents"("userId", "sha256");

-- CreateIndex
CREATE INDEX "pdf_passwords_userId_idx" ON "pdf_passwords"("userId");

-- AddForeignKey
ALTER TABLE "lab_documents" ADD CONSTRAINT "lab_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_documents" ADD CONSTRAINT "lab_documents_labResultId_fkey" FOREIGN KEY ("labResultId") REFERENCES "lab_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdf_passwords" ADD CONSTRAINT "pdf_passwords_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

