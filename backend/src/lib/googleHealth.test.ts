// src/lib/googleHealth.test.ts
// Tests unitaires du wrapper OAuth2 Google Health (src/lib/googleHealth.ts),
// avec `openid-client` mocké — même approche que lib/oidc.test.ts : on
// vérifie le protocole (scopes santé, PKCE/state, access_type=offline +
// prompt=consent), pas un vrai appel réseau à Google.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const discoveryMock = vi.fn();
const buildAuthorizationUrlMock = vi.fn();
const authorizationCodeGrantMock = vi.fn();
const refreshTokenGrantMock = vi.fn();

vi.mock('openid-client', () => ({
  discovery: (...args: unknown[]) => discoveryMock(...args),
  randomPKCECodeVerifier: () => 'test-code-verifier',
  calculatePKCECodeChallenge: async () => 'test-code-challenge',
  randomState: () => 'test-state',
  buildAuthorizationUrl: (...args: unknown[]) => buildAuthorizationUrlMock(...args),
  authorizationCodeGrant: (...args: unknown[]) => authorizationCodeGrantMock(...args),
  refreshTokenGrant: (...args: unknown[]) => refreshTokenGrantMock(...args),
}));

describe('lib/googleHealth', () => {
  let googleHealth: typeof import('./googleHealth.js');

  beforeEach(async () => {
    vi.resetModules();
    discoveryMock.mockReset();
    buildAuthorizationUrlMock.mockReset();
    authorizationCodeGrantMock.mockReset();
    refreshTokenGrantMock.mockReset();

    process.env.GOOGLE_HEALTH_CLIENT_ID = 'test-health-client-id';
    process.env.GOOGLE_HEALTH_CLIENT_SECRET = 'test-health-client-secret';
    discoveryMock.mockResolvedValue({ __fakeConfig: true });
    buildAuthorizationUrlMock.mockReturnValue(new URL('https://accounts.google.com/o/oauth2/auth?mock=1'));

    googleHealth = await import('./googleHealth.js');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('buildGoogleHealthAuthorizationUrl', () => {
    it('requests health scopes with offline access and forced consent (needed for a refresh_token)', async () => {
      const { url, flow } = await googleHealth.buildGoogleHealthAuthorizationUrl();

      expect(url).toContain('accounts.google.com');
      expect(flow).toEqual({ state: 'test-state', codeVerifier: 'test-code-verifier' });
      expect(buildAuthorizationUrlMock).toHaveBeenCalledWith(
        { __fakeConfig: true },
        expect.objectContaining({
          scope: googleHealth.GOOGLE_HEALTH_SCOPES.join(' '),
          code_challenge: 'test-code-challenge',
          code_challenge_method: 'S256',
          state: 'test-state',
          access_type: 'offline',
          prompt: 'consent',
        })
      );
    });

    it('throws instead of silently degrading when Google Health credentials are absent', async () => {
      vi.resetModules();
      delete process.env.GOOGLE_HEALTH_CLIENT_ID;
      delete process.env.GOOGLE_HEALTH_CLIENT_SECRET;
      const unconfigured = await import('./googleHealth.js');

      await expect(unconfigured.buildGoogleHealthAuthorizationUrl()).rejects.toThrow(/GOOGLE_HEALTH_CLIENT_ID/);
      expect(discoveryMock).not.toHaveBeenCalled();
    });
  });

  describe('handleGoogleHealthCallback', () => {
    const flow = { state: 'test-state', codeVerifier: 'test-code-verifier' };

    it('returns tokens when the exchange succeeds and Google grants a refresh_token', async () => {
      authorizationCodeGrantMock.mockResolvedValue({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        scope: 'health.sleep.read health.body.read',
        expiresIn: () => 3600,
      });

      const tokens = await googleHealth.handleGoogleHealthCallback(
        new URL('https://app.example.com/callback?code=abc&state=test-state'),
        flow
      );

      expect(tokens.accessToken).toBe('access-token');
      expect(tokens.refreshToken).toBe('refresh-token');
      expect(tokens.scope).toBe('health.sleep.read health.body.read');
      expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(authorizationCodeGrantMock).toHaveBeenCalledWith(
        { __fakeConfig: true },
        expect.any(URL),
        expect.objectContaining({ pkceCodeVerifier: 'test-code-verifier', expectedState: 'test-state' })
      );
    });

    it('fails loudly when Google does not return a refresh_token (would leave an unusable connection)', async () => {
      authorizationCodeGrantMock.mockResolvedValue({
        access_token: 'access-token',
        scope: 'health.sleep.read',
        expiresIn: () => 3600,
      });

      await expect(
        googleHealth.handleGoogleHealthCallback(
          new URL('https://app.example.com/callback?code=abc&state=test-state'),
          flow
        )
      ).rejects.toThrow(/refresh_token/);
    });

    it('propagates a state mismatch instead of swallowing it', async () => {
      authorizationCodeGrantMock.mockRejectedValue(new Error('state mismatch'));

      await expect(
        googleHealth.handleGoogleHealthCallback(new URL('https://app.example.com/callback?code=abc&state=wrong'), flow)
      ).rejects.toThrow('state mismatch');
    });
  });

  describe('refreshAccessToken', () => {
    it('exchanges a refresh_token for a fresh access_token', async () => {
      refreshTokenGrantMock.mockResolvedValue({ access_token: 'new-access-token', expiresIn: () => 3600 });

      const result = await googleHealth.refreshAccessToken('refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(refreshTokenGrantMock).toHaveBeenCalledWith({ __fakeConfig: true }, 'refresh-token');
    });
  });

  describe('zonedMidnightUtc / localDateOf', () => {
    it('places local midnight at the right UTC instant, DST included', () => {
      // Montréal : UTC-4 l'été, UTC-5 l'hiver.
      expect(new Date(googleHealth.zonedMidnightUtc('2026-07-01', 'America/Montreal')).toISOString()).toBe(
        '2026-07-01T04:00:00.000Z'
      );
      expect(new Date(googleHealth.zonedMidnightUtc('2026-01-15', 'America/Montreal')).toISOString()).toBe(
        '2026-01-15T05:00:00.000Z'
      );
      // Paris : jour du passage à l'heure d'été (minuit encore en UTC+1).
      expect(new Date(googleHealth.zonedMidnightUtc('2026-03-29', 'Europe/Paris')).toISOString()).toBe(
        '2026-03-28T23:00:00.000Z'
      );
    });

    it('gives the civil date of an instant in the user time zone', () => {
      // 01:30 UTC le 18 = 21:30 le 17 à Montréal.
      expect(googleHealth.localDateOf(Date.parse('2026-10-18T01:30:00Z'), 'America/Montreal')).toBe('2026-10-17');
      expect(googleHealth.localDateOf(Date.parse('2026-10-18T01:30:00Z'), 'Europe/Paris')).toBe('2026-10-18');
    });
  });

  describe('summarizeSleepForDate', () => {
    const tz = 'America/Montreal';
    // Nuit du 16 au 17 octobre, 23:00 → 07:00 heure locale (UTC-4).
    const interval = { startTime: '2026-10-17T03:00:00Z', endTime: '2026-10-17T11:00:00Z' };
    const night = { sleep: { interval } };

    it('counts a night crossing midnight once, on the wake-up day only', () => {
      expect(googleHealth.summarizeSleepForDate([night], '2026-10-17', tz)?.hours).toBe(8);
      expect(googleHealth.summarizeSleepForDate([night], '2026-10-16', tz)).toBeNull();
    });

    it('uses the local wake-up date, not the UTC one', () => {
      // Réveil 21:30 heure locale le 17 = 01:30 UTC le 18 (sieste du soir).
      const nap = { sleep: { interval: { startTime: '2026-10-18T00:30:00Z', endTime: '2026-10-18T01:30:00Z' } } };
      expect(googleHealth.summarizeSleepForDate([nap], '2026-10-17', tz)?.hours).toBe(1);
      expect(googleHealth.summarizeSleepForDate([nap], '2026-10-18', tz)).toBeNull();
    });

    it('prefers the civil wake-up date given by Google over the profile time zone', () => {
      // Profil resté sur Paris, appareil en voyage : la date civile de l'appareil fait foi.
      const point = { sleep: { interval: { ...interval, civilEndTime: '2026-10-17T07:00:00' } } };
      expect(googleHealth.summarizeSleepForDate([point], '2026-10-17', 'Asia/Tokyo')?.hours).toBe(8);
      const objectForm = { sleep: { interval: { ...interval, civilEndTime: { date: { year: 2026, month: 10, day: 17 } } } } };
      expect(googleHealth.summarizeSleepForDate([objectForm], '2026-10-17', 'Asia/Tokyo')?.hours).toBe(8);
    });

    it('adds naps of the same day and ignores a duplicated session', () => {
      const nap = { sleep: { interval: { startTime: '2026-10-17T18:00:00Z', endTime: '2026-10-17T18:30:00Z' } } };
      expect(googleHealth.summarizeSleepForDate([night, nap, night], '2026-10-17', tz)?.hours).toBe(8.5);
    });

    it('uses the Google summary (int64 as strings): asleep time, efficiency, deep and REM', () => {
      const point = {
        sleep: {
          interval,
          summary: {
            minutesAsleep: '432',
            minutesInSleepPeriod: '480',
            stagesSummary: [
              { type: 'DEEP', minutes: '70' },
              { type: 'REM', minutes: '95' },
              { type: 'AWAKE', minutes: '48' },
            ],
          },
        },
      };
      expect(googleHealth.summarizeSleepForDate([point], '2026-10-17', tz)).toEqual({
        hours: 7.2,
        efficiency: 90,
        deepMinutes: 70,
        remMinutes: 95,
      });
    });

    it('falls back to stage segments when there is no summary', () => {
      const point = {
        sleep: {
          interval,
          stages: [
            { type: 'LIGHT', startTime: '2026-10-17T03:00:00Z', endTime: '2026-10-17T06:00:00Z' },
            { type: 'AWAKE', startTime: '2026-10-17T06:00:00Z', endTime: '2026-10-17T06:30:00Z' },
            { type: 'DEEP', startTime: '2026-10-17T06:30:00Z', endTime: '2026-10-17T08:00:00Z' },
            { type: 'REM', startTime: '2026-10-17T08:00:00Z', endTime: '2026-10-17T11:00:00Z' },
          ],
        },
      };
      expect(googleHealth.summarizeSleepForDate([point], '2026-10-17', tz)).toEqual({
        hours: 7.5,
        efficiency: 94,
        deepMinutes: 90,
        remMinutes: 180,
      });
    });

    it('leaves deep/REM empty when a session of the day has no stages (classic sleep)', () => {
      const staged = { sleep: { interval, summary: { stagesSummary: [{ type: 'DEEP', minutes: 60 }, { type: 'REM', minutes: 90 }] } } };
      const classicNap = { sleep: { interval: { startTime: '2026-10-17T18:00:00Z', endTime: '2026-10-17T18:30:00Z' } } };
      const day = googleHealth.summarizeSleepForDate([staged, classicNap], '2026-10-17', tz);
      expect(day?.deepMinutes).toBeNull();
      expect(day?.remMinutes).toBeNull();
    });

    it('returns null when no point has a usable interval', () => {
      const broken = [{}, { sleep: {} }, { sleep: { interval: { startTime: 'x', endTime: 'y' } } }];
      expect(googleHealth.summarizeSleepForDate(broken, '2026-10-17', tz)).toBeNull();
    });
  });

  describe('latestSample', () => {
    it('keeps the most recent sample by time, whatever the array order, and reads int64 strings', () => {
      expect(
        googleHealth.latestSample([
          { time: '2026-10-17T12:00:00Z', value: '70' },
          { time: '2026-10-17T18:00:00Z', value: '64' },
          { time: '2026-10-17T08:00:00Z', value: 80 },
          { time: undefined, value: 99 },
        ])
      ).toBe(64);
      expect(googleHealth.latestSample([])).toBeNull();
    });
  });

  describe('describeShape', () => {
    it('keeps field names and types but never values', () => {
      const shape = googleHealth.describeShape({ weight: { weightGrams: '62500', sampleTime: { physicalTime: '2026-10-17T07:00:00Z' } } });
      expect(shape).toEqual({ weight: { weightGrams: 'string', sampleTime: { physicalTime: 'string' } } });
      expect(JSON.stringify(shape)).not.toContain('62500');
    });
  });

  describe('fetchDailyMetrics', () => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

    it('reads the v4 shapes: weight in grams, heart rate, and a night filtered on its civil end time', async () => {
      const fetchMock = vi.fn(async (url: URL) => {
        if (url.pathname.endsWith('/weight/dataPoints')) {
          return ok({ dataPoints: [{ weight: { sampleTime: { physicalTime: '2026-10-17T11:30:00Z' }, weightGrams: '62480' } }] });
        }
        if (url.pathname.endsWith('/heart-rate/dataPoints')) {
          return ok({ dataPoints: [{ heartRate: { sampleTime: { physicalTime: '2026-10-17T12:00:00Z' }, beatsPerMinute: '68' } }] });
        }
        return ok({
          dataPoints: [
            {
              sleep: {
                interval: { startTime: '2026-10-17T03:00:00Z', endTime: '2026-10-17T11:00:00Z' },
                summary: { minutesAsleep: '450', minutesInSleepPeriod: '480' },
              },
            },
          ],
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const metrics = await googleHealth.fetchDailyMetrics('token', '2026-10-17', 'America/Montreal');

      expect(metrics).toEqual({
        weightKg: 62.48,
        heartRateBpm: 68,
        sleepHours: 7.5,
        sleepEfficiency: 94,
        deepSleepMinutes: null,
        remSleepMinutes: null,
      });
      const sleepUrl = fetchMock.mock.calls.map(([u]) => u).find((u) => u.pathname.endsWith('/sleep/dataPoints'))!;
      expect(sleepUrl.searchParams.get('filter')).toBe(
        'sleep.interval.civil_end_time >= "2026-10-17T00:00:00" AND sleep.interval.civil_end_time < "2026-10-18T00:00:00"'
      );
      const weightUrl = fetchMock.mock.calls.map(([u]) => u).find((u) => u.pathname.endsWith('/weight/dataPoints'))!;
      // Journée en heure de Montréal (UTC-4), pas en UTC.
      expect(weightUrl.searchParams.get('filter')).toContain('"2026-10-17T04:00:00.000Z"');
    });

    it('retries sleep without a filter when Google rejects it', async () => {
      const fetchMock = vi.fn(async (url: URL) => {
        if (url.pathname.endsWith('/sleep/dataPoints') && url.searchParams.has('filter')) {
          return { ok: false, status: 400, json: async () => ({}), text: async () => 'not supported for filtering' };
        }
        return ok({ dataPoints: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      await googleHealth.fetchDailyMetrics('token', '2026-10-17', 'America/Montreal');

      const sleepCalls = fetchMock.mock.calls.map(([u]) => u).filter((u) => u.pathname.endsWith('/sleep/dataPoints'));
      expect(sleepCalls).toHaveLength(2);
      expect(sleepCalls[1].searchParams.has('filter')).toBe(false);
    });
  });

  describe('getHealthUserId', () => {
    it('returns healthUserId when present in the response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ healthUserId: 'hu-1' }) }));

      const id = await googleHealth.getHealthUserId('access-token');

      expect(id).toBe('hu-1');
    });

    it('falls back to other plausible field names when healthUserId is absent', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ userId: 'hu-2' }) }));

      const id = await googleHealth.getHealthUserId('access-token');

      expect(id).toBe('hu-2');
    });

    it('throws with the raw body when no recognized id field is found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ somethingElse: 'x' }) }));

      await expect(googleHealth.getHealthUserId('access-token')).rejects.toThrow(/healthUserId/);
    });

    it('throws (rather than silently swallowing) on an HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }));

      await expect(googleHealth.getHealthUserId('access-token')).rejects.toThrow(/401/);
    });
  });
});
