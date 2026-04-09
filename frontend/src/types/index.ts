// src/types/index.ts

export interface User {
  id: string;
  email: string;
  name: string;
  birthDate?: string;
  createdAt: string;
  profile?: UserProfile;
}

export interface UserProfile {
  diagnosisType?: DiagnosisType;
  diagnosisDate?: string;
  thyroidStatus?: ThyroidStatus;
  endocrinologistName?: string;
  targetTSH_min?: number;
  targetTSH_max?: number;
  targetFT4_min?: number;
  targetFT4_max?: number;
  targetFT3_min?: number;
  targetFT3_max?: number;
  timezone: string;
  weightUnit: 'KG' | 'LBS';
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT';
}

export type DiagnosisType =
  | 'HYPOTHYROIDISM' | 'HYPERTHYROIDISM' | 'HASHIMOTO'
  | 'GRAVES' | 'THYROID_CANCER' | 'NODULES' | 'GOITER' | 'OTHER';

export type ThyroidStatus =
  | 'INTACT' | 'PARTIAL_REMOVAL' | 'TOTAL_REMOVAL'
  | 'RADIOIODINE_ABLATION' | 'RADIOIODINE_PARTIAL';

export interface DailyEntry {
  id: string;
  date: string;
  energyLevel?: number | null;
  moodScore?: number | null;
  anxietyLevel?: number | null;
  brainFogLevel?: number | null;
  weight?: number | null;
  bodyTemperature?: number | null;
  heartRate?: number | null;
  bloodPressureSys?: number | null;
  bloodPressureDia?: number | null;
  coldSensitivity?: number | null;
  heatSensitivity?: number | null;
  hairLoss?: number | null;
  drySkin?: number | null;
  constipation?: number | null;
  bloating?: number | null;
  muscleWeakness?: number | null;
  jointPain?: number | null;
  neckPain?: number | null;
  swelling?: number | null;
  tremors?: number | null;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  medicationTaken: boolean;
  medicationTime?: string | null;
  medicationNotes?: string | null;
  notes?: string | null;
  tags: string[];
}

export interface LabResult {
  id: string;
  date: string;
  lab?: string | null;
  orderedBy?: string | null;
  tsh?: number | null;
  ft4?: number | null;
  ft3?: number | null;
  t4?: number | null;
  t3?: number | null;
  antiTPO?: number | null;
  antiTG?: number | null;
  antiTSHR?: number | null;
  thyroglobulin?: number | null;
  ferritin?: number | null;
  vitaminD?: number | null;
  vitaminB12?: number | null;
  magnesium?: number | null;
  selenium?: number | null;
  cholesterol?: number | null;
  glucose?: number | null;
  hemoglobin?: number | null;
  notes?: string | null;
}

export interface Medication {
  id: string;
  name: string;
  brand?: string | null;
  dosageMcg: number;
  frequency: 'DAILY' | 'EVERY_OTHER_DAY' | 'WEEKLY' | 'AS_NEEDED';
  intakeTime?: string | null;
  startDate: string;
  endDate?: string | null;
  active: boolean;
  instructions?: string | null;
  notes?: string | null;
}

export interface Appointment {
  id: string;
  date: string;
  type: AppointmentType;
  doctorName?: string | null;
  specialty?: string | null;
  location?: string | null;
  notes?: string | null;
  reminder: boolean;
  status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
}

export type AppointmentType =
  | 'ENDOCRINOLOGIST' | 'GENERAL_PRACTITIONER' | 'ULTRASOUND'
  | 'BLOOD_TEST' | 'SCINTIGRAPHY' | 'BIOPSY' | 'OTHER';

export interface AnalyticsOverview {
  period: { from: string; days: number };
  totalEntries: number;
  streak: number;
  averages: { energy: number | null; mood: number | null };
  medicationAdherence: number | null;
  activeMedications: Pick<Medication, 'name' | 'dosageMcg' | 'intakeTime'>[];
  latestLabResult: Pick<LabResult, 'date' | 'tsh' | 'ft4' | 'ft3'> | null;
  labHistory: Pick<LabResult, 'date' | 'tsh' | 'ft4' | 'ft3'>[];
  nextAppointment: Appointment | null;
  timeSeries: Pick<DailyEntry, 'date' | 'energyLevel' | 'moodScore' | 'weight' | 'sleepHours' | 'medicationTaken' | 'heartRate'>[];
}

// Reference ranges (standard lab values)
export const LAB_RANGES = {
  tsh: { min: 0.4, max: 4.0, unit: 'mUI/L', label: 'TSH' },
  ft4: { min: 12, max: 22, unit: 'pmol/L', label: 'FT4' },
  ft3: { min: 3.5, max: 6.5, unit: 'pmol/L', label: 'FT3' },
  antiTPO: { min: 0, max: 34, unit: 'UI/mL', label: 'Anti-TPO' },
} as const;

export const DIAGNOSIS_LABELS: Record<DiagnosisType, string> = {
  HYPOTHYROIDISM: 'Hypothyroïdie',
  HYPERTHYROIDISM: 'Hyperthyroïdie',
  HASHIMOTO: 'Thyroïdite de Hashimoto',
  GRAVES: 'Maladie de Basedow',
  THYROID_CANCER: 'Cancer thyroïdien',
  NODULES: 'Nodules thyroïdiens',
  GOITER: 'Goitre',
  OTHER: 'Autre',
};

export const THYROID_STATUS_LABELS: Record<ThyroidStatus, string> = {
  INTACT: 'Thyroïde intacte',
  PARTIAL_REMOVAL: 'Ablation partielle',
  TOTAL_REMOVAL: 'Thyroïdectomie totale',
  RADIOIODINE_ABLATION: 'Ablation à l\'iode radioactif',
  RADIOIODINE_PARTIAL: 'Iode radioactif (partiel)',
};
