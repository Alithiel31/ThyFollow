// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const password = await bcrypt.hash('demo1234', 12);

  const user = await prisma.user.upsert({
    where: { email: 'demo@thyrotrack.com' },
    update: {},
    create: {
      email: 'demo@thyrotrack.com',
      password,
      name: 'Sophie Martin',
      birthDate: new Date('1988-03-15'),
      profile: {
        create: {
          diagnosisType: 'HASHIMOTO',
          diagnosisDate: new Date('2018-06-01'),
          thyroidStatus: 'INTACT',
          endocrinologistName: 'Dr. Leblanc',
          targetTSH_min: 0.5,
          targetTSH_max: 2.5,
          timezone: 'Europe/Paris',
        },
      },
      notifications: { create: {} },
      medications: {
        create: {
          name: 'Levothyrox',
          dosageMcg: 75,
          frequency: 'DAILY',
          intakeTime: '07:00',
          startDate: new Date('2018-07-01'),
          instructions: 'À jeun, 30 minutes avant le repas',
          active: true,
        },
      },
    },
  });

  // Seed 30 days of entries
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    await prisma.dailyEntry.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: {},
      create: {
        userId: user.id,
        date,
        energyLevel: Math.floor(Math.random() * 3) + 2,
        moodScore: Math.floor(Math.random() * 3) + 2,
        sleepHours: 6 + Math.random() * 3,
        medicationTaken: Math.random() > 0.1,
        weight: 62 + (Math.random() - 0.5),
        heartRate: 68 + Math.floor(Math.random() * 12),
      },
    });
  }

  // Seed lab results
  await prisma.labResult.createMany({
    data: [
      { userId: user.id, date: new Date('2024-01-15'), tsh: 3.2, ft4: 14.5, ft3: 4.1, antiTPO: 340 },
      { userId: user.id, date: new Date('2024-04-10'), tsh: 2.1, ft4: 15.8, ft3: 4.4, antiTPO: 290 },
      { userId: user.id, date: new Date('2024-07-22'), tsh: 1.8, ft4: 16.2, ft3: 4.6, antiTPO: 265 },
      { userId: user.id, date: new Date('2024-10-15'), tsh: 2.4, ft4: 15.1, ft3: 4.3, antiTPO: 310 },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Seed completed. Demo account: demo@thyrotrack.com / demo1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
