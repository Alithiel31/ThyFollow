// src/types/index.ts

export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  birthDate?: string;
  createdAt: string;
  profile?: UserProfile;
  // Comptes fédérés liés (ex: Google) — sert à afficher l'état "lié/non lié"
  // dans le Profil (voir ProfilePage.tsx, section "Comptes liés").
  oauthAccounts?: { provider: string }[];
  // Connexion Google Health (poids/FC/sommeil, ex: Pixel Watch) — absente si
  // jamais connectée. Ne contient jamais de token, juste l'état de la synchro.
  googleHealthConnection?: { connectedAt: string; lastSyncedAt: string | null } | null;
  // Accès Pro (import de bilans PDF) et solde d'imports — calculé par le serveur
  entitlements?: Entitlements;
}

export interface Entitlements {
  pro: boolean;
  proUntil: string | null;
  proSource: 'STRIPE' | 'PROMO' | 'GRANT' | null;
  // Paiement par carte disponible sur ce serveur (sinon : codes promo seulement)
  billingEnabled: boolean;
  imports: {
    // Hors Pro : essai à vie ('lifetime') ; Pro : plafond remis à zéro chaque mois ('month')
    period: 'lifetime' | 'month';
    limit: number;
    used: number;
    remaining: number;
  };
}

// Historique des connexions/liaisons Google (voir backend authEvents.ts),
// affiché dans le Profil sous "Activité récente".
export type AuthEventType = 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LINKED' | 'LINK_CONFLICT' | 'LINK_FAILED' | 'UNLINKED';

export interface AuthEvent {
  id: string;
  provider: string;
  type: AuthEventType;
  userAgent: string | null;
  createdAt: string;
}

export interface UserProfile {
  diagnosisType?: DiagnosisType;
  diagnosisDate?: string;
  thyroidStatus?: ThyroidStatus;
  endocrinologistName?: string;
  // Consentement (opt-in) à l'extraction de bilans par IA en repli ; null/absent = non consenti
  aiExtractionConsentAt?: string | null;
  // Lecture par IA à chaque import (comparée aux règles), au lieu d'un simple repli
  aiExtractionAlways?: boolean;
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

// Provenance d'une mesure synchronisable (poids/FC/sommeil) : MANUAL tant
// que l'utilisateur n'a pas connecté Google Health, ou GOOGLE_HEALTH si la
// valeur vient d'une synchro automatique (voir LogPage.tsx, badge montre).
export type DataSource = 'MANUAL' | 'GOOGLE_HEALTH';

export interface DailyEntry {
  id: string;
  date: string;
  energyLevel?: number | null;
  moodScore?: number | null;
  anxietyLevel?: number | null;
  brainFogLevel?: number | null;
  weight?: number | null;
  weightSource?: DataSource;
  bodyTemperature?: number | null;
  heartRate?: number | null;
  heartRateSource?: DataSource;
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
  sleepHoursSource?: DataSource;
  sleepQuality?: number | null;
  medicationTaken: boolean;
  medicationTime?: string | null;
  medicationNotes?: string | null;
  notes?: string | null;
  // MANUAL = saisi à la main ; PDF_IMPORT = lu depuis un PDF puis relu et confirmé
  source?: 'MANUAL' | 'GOOGLE_HEALTH' | 'PDF_IMPORT';
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
  // MANUAL = saisi à la main ; PDF_IMPORT = lu depuis un PDF puis relu et confirmé
  source?: 'MANUAL' | 'GOOGLE_HEALTH' | 'PDF_IMPORT';
  // PDF rattachés (import de bilans) — ids seulement, le contenu se télécharge
  // via labApi.downloadDocument
  documents?: { id: string }[];
}

// ── Import de bilans PDF (voir backend labImport.controller.ts)
export const LAB_MARKER_KEYS = [
  'tsh', 'ft4', 'ft3', 't4', 't3', 'antiTPO', 'antiTG', 'antiTSHR', 'thyroglobulin',
  'ferritin', 'vitaminD', 'vitaminB12', 'magnesium', 'selenium', 'cholesterol', 'glucose', 'hemoglobin',
] as const;
export type LabMarkerKey = (typeof LAB_MARKER_KEYS)[number];

export type ImportStatus =
  | 'ready' | 'password_required' | 'wrong_password' | 'invalid' | 'too_large' | 'duplicate'
  | 'quota_exceeded' | 'failed';

export interface ImportDraft {
  date: string | null;
  dateConfidence: 'high' | 'low' | null;
  lab: string | null;
  orderedBy: string | null;
  values: Partial<Record<LabMarkerKey, number>>;
  flags: { marker: LabMarkerKey; reason: 'comparator' | 'unknown_unit' | 'no_unit' | 'converted' }[];
  insufficient: boolean;
  // rules : lecture locale ; llm : complétée par l'IA ; both : les deux lectures comparées
  method: 'rules' | 'llm' | 'both';
  // Champs sur lesquels les deux lectures divergent (null = rien trouvé par ce lecteur)
  conflicts: { field: 'date' | LabMarkerKey; rules: string | number | null; ai: string | number | null }[];
}

export interface ImportFileResult {
  filename: string;
  status: ImportStatus;
  documentId?: string;
  duplicateOf?: { labResultId: string };
  draft?: ImportDraft;
  possibleDuplicateOf?: { labResultId: string };
  reason?: string;
}

export interface PdfPasswordEntry {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export type DosageUnit = 'MCG' | 'MG' | 'IU' | 'TABLET' | 'DROP' | 'ML' | 'OTHER';

export interface Medication {
  id: string;
  name: string;
  brand?: string | null;
  dosage: number;
  dosageUnit: DosageUnit;
  frequency: 'DAILY' | 'EVERY_OTHER_DAY' | 'WEEKLY' | 'AS_NEEDED';
  intakeTimes: string[];
  startDate: string;
  endDate?: string | null;
  active: boolean;
  showOnChart: boolean;
  dosePeriods: DosePeriod[];
  instructions?: string | null;
  notes?: string | null;
}

// Un créneau de prise : `doses` est un cycle répété en boucle depuis le début de la période
// (`[75, 100]` = alternance, `[75, 0]` = un jour sur deux). `time` null = sans heure fixe.
export interface DoseSlot {
  time: string | null;
  doses: number[];
}

// Une posologie, en vigueur de startDate jusqu'au début de la période suivante.
export interface DosePeriod {
  id: string;
  startDate: string;
  slots: DoseSlot[];
}

// Une prise validée (checklist) pour un médicament donné, un jour et un créneau donnés.
export interface MedicationIntake {
  id: string;
  medicationId: string;
  date: string;
  time: string;
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
  activeMedications: Pick<Medication, 'name' | 'dosage' | 'dosageUnit' | 'intakeTimes'>[];
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

// Marqueurs affichés sur les cartes du carnet, dans l'ordre : thyroïde, anticorps, carences,
// métabolisme. Les unités sont celles du modèle (voir backend/src/lib/labExtract/units.ts) ;
// les libellés courts sont traduits (`labResults.marker.<clé>`).
export const MARKER_DISPLAY: ReadonlyArray<{ key: LabMarkerKey; unit: string }> = [
  { key: 'tsh', unit: 'mUI/L' },
  { key: 'ft4', unit: 'pmol/L' },
  { key: 'ft3', unit: 'pmol/L' },
  { key: 't4', unit: 'nmol/L' },
  { key: 't3', unit: 'nmol/L' },
  { key: 'antiTPO', unit: 'UI/mL' },
  { key: 'antiTG', unit: 'UI/mL' },
  { key: 'antiTSHR', unit: 'UI/L' },
  { key: 'thyroglobulin', unit: 'µg/L' },
  { key: 'ferritin', unit: 'µg/L' },
  { key: 'vitaminD', unit: 'nmol/L' },
  { key: 'vitaminB12', unit: 'pmol/L' },
  { key: 'magnesium', unit: 'mmol/L' },
  { key: 'selenium', unit: 'µg/L' },
  { key: 'cholesterol', unit: 'mmol/L' },
  { key: 'glucose', unit: 'mmol/L' },
  { key: 'hemoglobin', unit: 'g/dL' },
];

// Les libellés sont traduits via i18next (namespaces "diagnosis" / "thyroidStatus") ;
// ces tableaux ne servent qu'à itérer les valeurs possibles dans l'UI.
export const DIAGNOSIS_LABEL_KEYS: DiagnosisType[] = [
  'HYPOTHYROIDISM', 'HYPERTHYROIDISM', 'HASHIMOTO', 'GRAVES',
  'THYROID_CANCER', 'NODULES', 'GOITER', 'OTHER',
];

export const THYROID_STATUS_LABEL_KEYS: ThyroidStatus[] = [
  'INTACT', 'PARTIAL_REMOVAL', 'TOTAL_REMOVAL',
  'RADIOIODINE_ABLATION', 'RADIOIODINE_PARTIAL',
];

// ── Contenu éditorial ──────────────────────────
export type ArticleKind = 'ARTICLE' | 'TIP';

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  content: string;
  kind: ArticleKind;
  published: boolean;
  publishedAt?: string | null;
  updatedAt: string;
}

// Liste : le contenu n'est renvoyé que pour les encarts (courts)
export type ArticleSummary = Omit<Article, 'content'> & { content?: string };

// ── Rapport de période ─────────────────────────
export interface ReportData {
  period: { from: string; to: string };
  totalEntries: number;
  scores: Record<string, number | null>;
  physical: {
    weight: number | null;
    bodyTemperature: number | null;
    heartRate: number | null;
    sleepHours: number | null;
  };
  medicationAdherence: number | null;
  activeMedications: Pick<Medication, 'name' | 'brand' | 'dosage' | 'dosageUnit' | 'frequency' | 'intakeTimes'>[];
  labResults: LabResult[];
}
