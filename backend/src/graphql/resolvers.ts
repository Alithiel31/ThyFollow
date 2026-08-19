// src/graphql/resolvers.ts
import { GraphQLError } from 'graphql';
import { prisma } from '../lib/prisma.js';
import type { GraphQLContext } from './context.js';

// Toutes les dates Prisma (DateTime/Date) sont exposées en `String` ISO
// côté schéma — voir la note de scope dans schema.ts.
function toISODate(date: Date): string {
  return date.toISOString();
}

interface MedicationsArgs {
  activeOnly?: boolean;
}

interface LimitArgs {
  limit?: number;
}

interface LogMedicationIntakeArgs {
  medicationId: string;
  date: string;
  time: string;
}

interface AddSymptomLogArgs {
  entryId: string;
  symptomId: string;
  severity: number;
  note?: string;
}

export const resolvers = {
  Query: {
    me: (_parent: unknown, _args: unknown, ctx: GraphQLContext) =>
      prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
  },

  Mutation: {
    // Même garde de propriété que les controllers REST : on ne fait jamais
    // confiance à un id fourni par le client sans vérifier qu'il appartient
    // à ctx.userId (voir ex. controllers/medications.controller.ts).
    logMedicationIntake: async (
      _parent: unknown,
      args: LogMedicationIntakeArgs,
      ctx: GraphQLContext
    ) => {
      const medication = await prisma.medication.findFirst({
        where: { id: args.medicationId, userId: ctx.userId },
      });
      if (!medication) {
        throw new GraphQLError('Medication not found', { extensions: { code: 'NOT_FOUND' } });
      }
      const date = new Date(args.date);
      return prisma.medicationIntake.upsert({
        where: { medicationId_date_time: { medicationId: medication.id, date, time: args.time } },
        create: { medicationId: medication.id, date, time: args.time },
        update: {},
      });
    },

    addSymptomLog: async (_parent: unknown, args: AddSymptomLogArgs, ctx: GraphQLContext) => {
      const entry = await prisma.dailyEntry.findFirst({
        where: { id: args.entryId, userId: ctx.userId },
      });
      if (!entry) {
        throw new GraphQLError('Daily entry not found', { extensions: { code: 'NOT_FOUND' } });
      }
      const symptom = await prisma.symptomLibrary.findFirst({
        where: { id: args.symptomId, userId: ctx.userId },
      });
      if (!symptom) {
        throw new GraphQLError('Symptom not found', { extensions: { code: 'NOT_FOUND' } });
      }
      return prisma.symptomLog.create({
        data: { entryId: args.entryId, symptomId: args.symptomId, severity: args.severity, note: args.note },
        include: { symptom: true },
      });
    },
  },

  User: {
    profile: (user: { id: string }) => prisma.userProfile.findUnique({ where: { userId: user.id } }),
    medications: (user: { id: string }, args: MedicationsArgs) =>
      prisma.medication.findMany({
        where: { userId: user.id, ...(args.activeOnly === false ? {} : { active: true }) },
        orderBy: { createdAt: 'desc' },
      }),
    dailyEntries: (user: { id: string }, args: LimitArgs) =>
      prisma.dailyEntry.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: args.limit ?? 30,
      }),
    labResults: (user: { id: string }, args: LimitArgs) =>
      prisma.labResult.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: args.limit ?? 10,
      }),
  },

  UserProfile: {
    targetTSHMin: (profile: { targetTSH_min: number | null }) => profile.targetTSH_min,
    targetTSHMax: (profile: { targetTSH_max: number | null }) => profile.targetTSH_max,
  },

  Medication: {
    // Batché via DataLoader pour éviter le N+1 (une requête par médicament
    // affiché) — voir dataloaders.ts.
    intakes: async (medication: { id: string }, args: LimitArgs, ctx: GraphQLContext) => {
      const all = await ctx.loaders.intakesByMedicationId.load(medication.id);
      return all.slice(0, args.limit ?? 30);
    },
  },

  MedicationIntake: {
    date: (intake: { date: Date }) => toISODate(intake.date),
    takenAt: (intake: { takenAt: Date }) => toISODate(intake.takenAt),
  },

  DailyEntry: {
    date: (entry: { date: Date }) => toISODate(entry.date),
    // Même logique de batching que Medication.intakes.
    symptomLogs: (entry: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.loaders.symptomLogsByEntryId.load(entry.id),
  },

  LabResult: {
    date: (labResult: { date: Date }) => toISODate(labResult.date),
  },
};
