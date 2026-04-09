-- CreateEnum
CREATE TYPE "DiagnosisType" AS ENUM ('HYPOTHYROIDISM', 'HYPERTHYROIDISM', 'HASHIMOTO', 'GRAVES', 'THYROID_CANCER', 'NODULES', 'GOITER', 'OTHER');

-- CreateEnum
CREATE TYPE "ThyroidStatus" AS ENUM ('INTACT', 'PARTIAL_REMOVAL', 'TOTAL_REMOVAL', 'RADIOIODINE_ABLATION', 'RADIOIODINE_PARTIAL');

-- CreateEnum
CREATE TYPE "MedFrequency" AS ENUM ('DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LBS');

-- CreateEnum
CREATE TYPE "TempUnit" AS ENUM ('CELSIUS', 'FAHRENHEIT');

-- CreateEnum
CREATE TYPE "SymptomCategory" AS ENUM ('ENERGY', 'MOOD', 'PHYSICAL', 'DIGESTIVE', 'SKIN_HAIR', 'COGNITIVE', 'SLEEP', 'PAIN', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('ENDOCRINOLOGIST', 'GENERAL_PRACTITIONER', 'ULTRASOUND', 'BLOOD_TEST', 'SCINTIGRAPHY', 'BIOPSY', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('UPCOMING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "diagnosisType" "DiagnosisType",
    "diagnosisDate" TIMESTAMP(3),
    "thyroidStatus" "ThyroidStatus",
    "endocrinologistName" TEXT,
    "targetTSH_min" DOUBLE PRECISION,
    "targetTSH_max" DOUBLE PRECISION,
    "targetFT4_min" DOUBLE PRECISION,
    "targetFT4_max" DOUBLE PRECISION,
    "targetFT3_min" DOUBLE PRECISION,
    "targetFT3_max" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "temperatureUnit" "TempUnit" NOT NULL DEFAULT 'CELSIUS',

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "energyLevel" INTEGER,
    "moodScore" INTEGER,
    "anxietyLevel" INTEGER,
    "brainFogLevel" INTEGER,
    "weight" DOUBLE PRECISION,
    "bodyTemperature" DOUBLE PRECISION,
    "heartRate" INTEGER,
    "bloodPressureSys" INTEGER,
    "bloodPressureDia" INTEGER,
    "coldSensitivity" INTEGER,
    "heatSensitivity" INTEGER,
    "hairLoss" INTEGER,
    "drySkin" INTEGER,
    "constipation" INTEGER,
    "bloating" INTEGER,
    "muscleWeakness" INTEGER,
    "jointPain" INTEGER,
    "neckPain" INTEGER,
    "swelling" INTEGER,
    "tremors" INTEGER,
    "sleepHours" DOUBLE PRECISION,
    "sleepQuality" INTEGER,
    "medicationTaken" BOOLEAN NOT NULL DEFAULT false,
    "medicationTime" TIMESTAMP(3),
    "medicationNotes" TEXT,
    "notes" TEXT,
    "tags" TEXT[],

    CONSTRAINT "daily_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symptom_library" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "category" "SymptomCategory" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "symptom_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symptom_logs" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "symptomId" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "symptom_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "dosageMcg" DOUBLE PRECISION NOT NULL,
    "frequency" "MedFrequency" NOT NULL DEFAULT 'DAILY',
    "intakeTime" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "instructions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_results" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "lab" TEXT,
    "orderedBy" TEXT,
    "tsh" DOUBLE PRECISION,
    "ft4" DOUBLE PRECISION,
    "ft3" DOUBLE PRECISION,
    "t4" DOUBLE PRECISION,
    "t3" DOUBLE PRECISION,
    "antiTPO" DOUBLE PRECISION,
    "antiTG" DOUBLE PRECISION,
    "antiTSHR" DOUBLE PRECISION,
    "thyroglobulin" DOUBLE PRECISION,
    "ferritin" DOUBLE PRECISION,
    "vitaminD" DOUBLE PRECISION,
    "vitaminB12" DOUBLE PRECISION,
    "magnesium" DOUBLE PRECISION,
    "selenium" DOUBLE PRECISION,
    "cholesterol" DOUBLE PRECISION,
    "glucose" DOUBLE PRECISION,
    "hemoglobin" DOUBLE PRECISION,
    "notes" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "AppointmentType" NOT NULL,
    "doctorName" TEXT,
    "specialty" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "reminder" BOOLEAN NOT NULL DEFAULT true,
    "reminderDays" INTEGER NOT NULL DEFAULT 2,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyLogReminder" BOOLEAN NOT NULL DEFAULT true,
    "dailyLogTime" TEXT NOT NULL DEFAULT '20:00',
    "medicationReminder" BOOLEAN NOT NULL DEFAULT true,
    "labResultReminder" BOOLEAN NOT NULL DEFAULT true,
    "labReminderWeeks" INTEGER NOT NULL DEFAULT 12,
    "appointmentReminder" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_entries_userId_date_key" ON "daily_entries"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_userId_key" ON "notification_settings"("userId");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptom_library" ADD CONSTRAINT "symptom_library_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptom_logs" ADD CONSTRAINT "symptom_logs_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "daily_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptom_logs" ADD CONSTRAINT "symptom_logs_symptomId_fkey" FOREIGN KEY ("symptomId") REFERENCES "symptom_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
