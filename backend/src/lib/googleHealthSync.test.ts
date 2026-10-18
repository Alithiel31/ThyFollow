// src/lib/googleHealthSync.test.ts
// Fusion des mesures Google Health dans DailyEntry (lib/googleHealthSync.ts)
// et rattrapage de l'historique. L'API Google elle-même est mockée : son
// parsing est couvert par lib/googleHealth.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = {
  googleHealthConnection: { findUnique: vi.fn(), update: vi.fn() },
  userProfile: { findUnique: vi.fn() },
  dailyEntry: { findUnique: vi.fn(), upsert: vi.fn() },
};
vi.mock('./prisma.js', () => ({ prisma: prismaMock }));
vi.mock('./crypto.js', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));

const fetchDailyMetricsMock = vi.fn();
vi.mock('./googleHealth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./googleHealth.js')>()),
  fetchDailyMetrics: (...args: unknown[]) => fetchDailyMetricsMock(...args),
  refreshAccessToken: vi.fn(),
}));

const USER_ID = 'user-1';
const connection = {
  id: 'conn-1',
  userId: USER_ID,
  accessTokenEnc: 'access-token',
  refreshTokenEnc: 'refresh-token',
  tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
};
const emptyMetrics = {
  weightKg: null,
  heartRateBpm: null,
  sleepHours: null,
  sleepEfficiency: null,
  deepSleepMinutes: null,
  remSleepMinutes: null,
};

describe('lib/googleHealthSync', () => {
  let sync: typeof import('./googleHealthSync.js');

  beforeEach(async () => {
    vi.resetModules();
    for (const model of Object.values(prismaMock)) for (const fn of Object.values(model)) fn.mockReset();
    fetchDailyMetricsMock.mockReset();
    prismaMock.googleHealthConnection.findUnique.mockResolvedValue(connection);
    prismaMock.userProfile.findUnique.mockResolvedValue({ timezone: 'America/Montreal' });
    prismaMock.dailyEntry.findUnique.mockResolvedValue(null);
    sync = await import('./googleHealthSync.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('syncDailyMetricsForUser', () => {
    it('passes the profile time zone and stores the watch-only sleep metrics', async () => {
      fetchDailyMetricsMock.mockResolvedValue({
        ...emptyMetrics,
        sleepHours: 7.2,
        sleepEfficiency: 90,
        deepSleepMinutes: 70,
        remSleepMinutes: 95,
      });

      await sync.syncDailyMetricsForUser(USER_ID, '2026-10-17');

      expect(fetchDailyMetricsMock).toHaveBeenCalledWith('access-token', '2026-10-17', 'America/Montreal');
      expect(prismaMock.dailyEntry.upsert.mock.calls[0][0].update).toEqual({
        sleepHours: 7.2,
        sleepHoursSource: 'GOOGLE_HEALTH',
        sleepEfficiency: 90,
        deepSleepMinutes: 70,
        remSleepMinutes: 95,
      });
    });

    it('never overwrites hours of sleep typed by the user, but still stores the watch details', async () => {
      prismaMock.dailyEntry.findUnique.mockResolvedValue({ sleepHours: 6, sleepHoursSource: 'MANUAL' });
      fetchDailyMetricsMock.mockResolvedValue({ ...emptyMetrics, sleepHours: 7.2, sleepEfficiency: 90 });

      await sync.syncDailyMetricsForUser(USER_ID, '2026-10-17');

      expect(prismaMock.dailyEntry.upsert.mock.calls[0][0].update).toEqual({ sleepEfficiency: 90 });
    });

    it('falls back to the default time zone when the profile one is invalid', async () => {
      prismaMock.userProfile.findUnique.mockResolvedValue({ timezone: 'Not/AZone' });
      fetchDailyMetricsMock.mockResolvedValue(emptyMetrics);

      await sync.syncDailyMetricsForUser(USER_ID, '2026-10-17');

      expect(fetchDailyMetricsMock).toHaveBeenCalledWith('access-token', '2026-10-17', 'Europe/Paris');
      expect(prismaMock.dailyEntry.upsert).not.toHaveBeenCalled();
    });
  });

  describe('resyncRecentDays', () => {
    it('re-reads the last N days ending today in the user time zone, and keeps going after a failure', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // 02:00 UTC le 18 = 22:00 le 17 à Montréal : « aujourd'hui » est le 17.
      vi.setSystemTime(new Date('2026-10-18T02:00:00Z'));
      fetchDailyMetricsMock.mockResolvedValueOnce(emptyMetrics).mockRejectedValueOnce(new Error('boom')).mockResolvedValue(emptyMetrics);

      const result = await sync.resyncRecentDays(USER_ID, 3);

      expect(fetchDailyMetricsMock.mock.calls.map((c) => c[1])).toEqual(['2026-10-17', '2026-10-16', '2026-10-15']);
      expect(result).toEqual({ synced: 2, failed: 1 });
      expect(sync.isResyncRunning(USER_ID)).toBe(false);
    });

    it('caps the number of days and refuses a second run for the same user', async () => {
      fetchDailyMetricsMock.mockResolvedValue(emptyMetrics);

      const first = sync.resyncRecentDays(USER_ID, 500);
      expect(sync.isResyncRunning(USER_ID)).toBe(true);
      await expect(sync.resyncRecentDays(USER_ID, 1)).rejects.toThrow(/déjà en cours/);
      await first;

      expect(fetchDailyMetricsMock).toHaveBeenCalledTimes(sync.MAX_RESYNC_DAYS);
    });
  });
});
