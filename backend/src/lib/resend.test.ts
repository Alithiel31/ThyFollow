// src/lib/resend.test.ts
// Le nom saisi à l'inscription ne doit jamais être interprété comme du HTML
// dans les emails : un tiers peut s'inscrire avec l'adresse de quelqu'un
// d'autre et choisir ce nom.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn(async (_payload: { html: string }) => ({ error: null }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const HOSTILE_NAME = '<a href="https://evil.example">Cliquez ici</a>';

async function load() {
  vi.resetModules();
  process.env.RESEND_API_KEY = 're_test';
  return import('./resend.js');
}

beforeEach(() => {
  sendMock.mockClear();
});

describe('emails transactionnels', () => {
  it('échappe le nom dans l’email de vérification', async () => {
    const { sendVerificationEmail } = await load();
    await sendVerificationEmail('victim@example.com', HOSTILE_NAME, 'token', 'fr');

    const { html } = sendMock.mock.calls[0][0];
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Cliquez ici&lt;/a&gt;');
  });

  it('échappe le nom dans l’email de réinitialisation', async () => {
    const { sendResetPasswordEmail } = await load();
    await sendResetPasswordEmail('victim@example.com', HOSTILE_NAME, 'token', 'en');

    const { html } = sendMock.mock.calls[0][0];
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('Hi &lt;a href=');
  });
});
