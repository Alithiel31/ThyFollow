// src/lib/googleHealthSubscriber.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getAccessTokenMock = vi.fn();
const getClientMock = vi.fn();

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    getClient(...args: unknown[]) {
      return getClientMock(...args);
    }
  },
}));

const SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: 'test@test.iam.gserviceaccount.com', private_key: 'x' });

describe('lib/googleHealthSubscriber', () => {
  let subscriber: typeof import('./googleHealthSubscriber.js');
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    getAccessTokenMock.mockReset();
    getClientMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);

    process.env.GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY = SERVICE_ACCOUNT_KEY;
    process.env.GOOGLE_HEALTH_PROJECT_NUMBER = '123456789';
    process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = 'Bearer test-secret';
    process.env.GOOGLE_HEALTH_REDIRECT_URI = 'https://app.example.com/api/integrations/google-health/callback';

    getClientMock.mockResolvedValue({ getAccessToken: getAccessTokenMock });
    getAccessTokenMock.mockResolvedValue({ token: 'sa-access-token' });

    subscriber = await import('./googleHealthSubscriber.js');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips creation when the subscriber already exists', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ subscribers: [{ name: 'projects/123456789/subscribers/thyrotrack-webhook' }] }),
    });

    await subscriber.ensureProjectSubscriber();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/projects/123456789/subscribers');
  });

  it('creates the subscriber with AUTOMATIC policy when none exists yet', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ subscribers: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'projects/123456789/subscribers/thyrotrack-webhook' }) });

    await subscriber.ensureProjectSubscriber();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [createUrl, createOptions] = fetchMock.mock.calls[1];
    expect(createUrl).toContain('subscriberId=thyrotrack-webhook');
    const body = JSON.parse(createOptions.body);
    expect(body.endpointUri).toBe('https://app.example.com/api/webhooks/google-health');
    expect(body.subscriberConfigs[0].subscriptionCreatePolicy).toBe('AUTOMATIC');
    expect(body.endpointAuthorization.secret).toBe('Bearer test-secret');
  });

  it('propagates an HTTP failure from the list call', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' });

    await expect(subscriber.ensureProjectSubscriber()).rejects.toThrow(/403/);
  });

  it('throws when the service account key is missing', async () => {
    delete process.env.GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY;
    vi.resetModules();
    subscriber = await import('./googleHealthSubscriber.js');

    await expect(subscriber.ensureProjectSubscriber()).rejects.toThrow(/GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY/);
  });
});
