// src/graphql/dataloaders.ts
// Sans batching, `Medication.intakes` (et `DailyEntry.symptomLogs`) ferait
// une requête Prisma par élément du parent — le classique problème N+1 : un
// utilisateur avec 5 médicaments actifs déclencherait 1 (medications) + 5
// (intakes) = 6 requêtes pour une seule query GraphQL. DataLoader regroupe
// tous les `.load()` émis dans le même tick en un unique appel batch, donc
// le total reste à 2 requêtes quel que soit le nombre de médicaments — voir
// dataloaders.test.ts pour la preuve, et docs/graphql.md pour le détail.
//
// Un loader est créé PAR REQUÊTE (dans context.ts), jamais au niveau module :
// son cache interne ne doit pas survivre au-delà d'une requête HTTP, sous
// peine de mélanger les données de deux utilisateurs différents.
import DataLoader from 'dataloader';
import type { PrismaClient, MedicationIntake, SymptomLog, SymptomLibrary } from '@prisma/client';

export type SymptomLogWithSymptom = SymptomLog & { symptom: SymptomLibrary };

export interface Loaders {
  intakesByMedicationId: DataLoader<string, MedicationIntake[]>;
  symptomLogsByEntryId: DataLoader<string, SymptomLogWithSymptom[]>;
}

// Regroupe une liste plate par clé, en respectant l'ordre attendu par
// DataLoader (un tableau de sortie aligné sur le tableau de clés en entrée,
// avec [] pour les clés sans résultat).
function groupBy<T, K>(rows: T[], keys: readonly K[], keyOf: (row: T) => K): T[][] {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return keys.map((key) => grouped.get(key) ?? []);
}

export function createLoaders(prisma: PrismaClient): Loaders {
  const intakesByMedicationId = new DataLoader<string, MedicationIntake[]>(async (medicationIds) => {
    const rows = await prisma.medicationIntake.findMany({
      where: { medicationId: { in: medicationIds as string[] } },
      orderBy: { date: 'desc' },
    });
    return groupBy(rows, medicationIds, (row) => row.medicationId);
  });

  const symptomLogsByEntryId = new DataLoader<string, SymptomLogWithSymptom[]>(async (entryIds) => {
    const rows = await prisma.symptomLog.findMany({
      where: { entryId: { in: entryIds as string[] } },
      include: { symptom: true },
    });
    return groupBy(rows, entryIds, (row) => row.entryId);
  });

  return { intakesByMedicationId, symptomLogsByEntryId };
}
