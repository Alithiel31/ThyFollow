// src/graphql/schema.ts
// SDL volontairement limitée à un sous-graphe (User → medications/entries/lab
// results) qui reproduit ce que analytics.controller.ts#overview assemble
// aujourd'hui « à la main » avec plusieurs requêtes Prisma en parallèle.
// Objectif : montrer l'intérêt d'une query imbriquée côté client, pas
// couvrir l'intégralité des 14 modèles Prisma — voir docs/graphql.md.
//
// Choix de scope assumés (portfolio, pas un système en production) :
// - dates exposées en `String` ISO via resolver plutôt qu'un scalar `Date`
//   custom ;
// - enums Prisma (DosageUnit, MedFrequency, SymptomCategory...) exposés en
//   `String` plutôt que mappés en enums GraphQL 1:1.
export const typeDefs = `#graphql
  type Query {
    me: User!
  }

  type Mutation {
    logMedicationIntake(medicationId: ID!, date: String!, time: String!): MedicationIntake!
    addSymptomLog(entryId: ID!, symptomId: ID!, severity: Int!, note: String): SymptomLog!
  }

  type User {
    id: ID!
    email: String!
    name: String!
    profile: UserProfile
    medications(activeOnly: Boolean = true): [Medication!]!
    dailyEntries(limit: Int = 30): [DailyEntry!]!
    labResults(limit: Int = 10): [LabResult!]!
  }

  type UserProfile {
    diagnosisType: String
    thyroidStatus: String
    targetTSHMin: Float
    targetTSHMax: Float
    timezone: String!
  }

  type Medication {
    id: ID!
    name: String!
    dosage: Float!
    dosageUnit: String!
    frequency: String!
    intakeTimes: [String!]!
    active: Boolean!
    intakes(limit: Int = 30): [MedicationIntake!]!
  }

  type MedicationIntake {
    id: ID!
    date: String!
    time: String!
    takenAt: String!
  }

  type DailyEntry {
    id: ID!
    date: String!
    energyLevel: Int
    moodScore: Int
    medicationTaken: Boolean!
    symptomLogs: [SymptomLog!]!
  }

  type SymptomLog {
    id: ID!
    severity: Int!
    note: String
    symptom: SymptomLibrary!
  }

  type SymptomLibrary {
    id: ID!
    name: String!
    icon: String
    category: String!
  }

  type LabResult {
    id: ID!
    date: String!
    tsh: Float
    ft4: Float
    ft3: Float
    lab: String
  }
`;
